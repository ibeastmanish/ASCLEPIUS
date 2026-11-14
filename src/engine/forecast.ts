// Autonomy Forecast: the Earth Reply Clock run for every day of the mission.
// For each day (JPL Horizons table, Nov 2026 - Dec 2029) it asks, at the crew's
// 07:00 Mars-local morning check: could Earth answer a red emergency, a 4-hour
// problem (fever pattern) and a routine 24-hour problem in time? The answer
// changes with the light time, the Sun blackout and the Mars-sol drift against
// Houston's shift. Pure: same inputs, same outputs.
import { HORIZONS_SOURCE, series } from "./horizons";
import { nextLocalTime } from "./mars";
import { computeReplyClock, spaceLink, type Autonomy, type Priority } from "./replyclock";
import { RULES, type Rules } from "./rules";
import type { MissionSetting } from "./types";

export type ForecastKind = "red" | "fever" | "routine";

export interface ForecastKindDef { kind: ForecastKind; label: string; priority: Priority; actWithinMin: number }

export function kinds(rules: Rules = RULES): ForecastKindDef[] {
  const a = rules.replyClock.actWithinMin;
  return [
    { kind: "red", label: "Emergency (act within 10 min)", priority: "red", actWithinMin: a.red },
    { kind: "fever", label: "4-hour problem (e.g. fever)", priority: "routine", actWithinMin: a["PT-FEVER"] },
    { kind: "routine", label: "Routine (act within a day)", priority: "routine", actWithinMin: a["tell-cmo"] },
  ];
}

export interface ForecastDay {
  date: string;
  oneWayMin: number;
  blackout: boolean;
  /** Real time (ms) of the crew's 07:00 Mars-local check that day. */
  morningMs: number;
  level: Record<ForecastKind, Autonomy>;
  replyMin: Record<ForecastKind, number>;
}

/** The forecast for every day in the JPL Horizons table (Mars missions only). */
export function forecast(lonE?: number, mission: MissionSetting = "mars", rules: Rules = RULES): ForecastDay[] {
  const defs = kinds(rules);
  return series().map((d) => {
    const morningMs = nextLocalTime(Date.parse(`${d.date}T00:00:00Z`), 7, lonE);
    const link = spaceLink(d.date, mission);
    const level = {} as Record<ForecastKind, Autonomy>;
    const replyMin = {} as Record<ForecastKind, number>;
    for (const k of defs) {
      const c = computeReplyClock({ nowMs: morningMs, link, priority: k.priority, actWithinMin: k.actWithinMin, actBasis: k.label, mission, baseLonE: lonE }, rules);
      level[k.kind] = c.level;
      replyMin[k.kind] = c.earliestReplyMin;
    }
    return { date: d.date, oneWayMin: link.oneWayMin, blackout: link.blackout, morningMs, level, replyMin };
  });
}

export interface Streak { start: string; end: string; days: number }

/** Longest run of consecutive days at a given level for one kind. */
export function longestStreak(days: ForecastDay[], kind: ForecastKind, level: Autonomy): Streak | null {
  let best: Streak | null = null;
  let start = -1;
  for (let i = 0; i <= days.length; i++) {
    const hit = i < days.length && days[i].level[kind] === level;
    if (hit && start < 0) start = i;
    if (!hit && start >= 0) {
      const len = i - start;
      if (!best || len > best.days) best = { start: days[start].date, end: days[i - 1].date, days: len };
      start = -1;
    }
  }
  return best;
}

export interface ForecastSummary {
  days: number;
  counts: Record<ForecastKind, Record<Autonomy, number>>;
  /** Longest stretch when the crew is alone even for routine problems. */
  aloneRoutine: Streak | null;
  /** Days on which a 4-hour problem can be guided by Earth, and the typical gap between such runs (Mars-sol drift). */
  feverGuidedDays: number;
  /** First blackout day in the table, and the date to start preparing (30 days before). */
  blackout?: { start: string; end: string; days: number; prepareFrom: string };
  source: string;
}

export function summarize(days: ForecastDay[]): ForecastSummary {
  const zero = () => ({ "earth-guided": 0, "earth-consulted": 0, "crew-decides": 0 });
  const counts = { red: zero(), fever: zero(), routine: zero() } as Record<ForecastKind, Record<Autonomy, number>>;
  for (const d of days) for (const k of Object.keys(counts) as ForecastKind[]) counts[k][d.level[k]]++;
  const bo = days.filter((d) => d.blackout);
  const prep = bo.length ? new Date(Date.parse(`${bo[0].date}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10) : undefined;
  return {
    days: days.length,
    counts,
    aloneRoutine: longestStreak(days, "routine", "crew-decides"),
    feverGuidedDays: counts.fever["earth-guided"],
    blackout: bo.length ? { start: bo[0].date, end: bo[bo.length - 1].date, days: bo.length, prepareFrom: prep! } : undefined,
    source: `${HORIZONS_SOURCE}; NASA GISS Mars24; Reply Clock assumptions in rules.json`,
  };
}
