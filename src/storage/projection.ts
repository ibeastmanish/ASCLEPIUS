// Projections (PRD 8.2): rebuild today's status, baselines, trends, streak,
// badges and the outbox from the event log. Pure functions.
import { addDays, toDayRecord } from "../engine/evaluate";
import { oneWayMin } from "../engine/horizons";
import type { Baselines, CheckResult, ContextTag, DayRecord, Indicator, Symptom } from "../engine/types";
import { INDICATORS } from "../engine/types";
import type { HEvent, OutboxMessage, Profile, Settings } from "./events";

export interface AppState {
  profile?: Profile;
  settings: Settings;
  checks: CheckResult[];
  days: DayRecord[];
  baselines: Baselines;
  outbox: OutboxMessage[];
  cmoAlerts: { ts: string; checkId: string; reason: string }[];
  tags: Record<string, ContextTag[]>;
  symptoms: Record<string, Symptom[]>;
  eventCount: number;
}

export const DEFAULT_SETTINGS: Settings = { reminderHour: 7 };

export function project(events: HEvent[]): AppState {
  const s: AppState = {
    settings: { ...DEFAULT_SETTINGS }, checks: [], days: [], baselines: {}, outbox: [], cmoAlerts: [],
    tags: {}, symptoms: {}, eventCount: events.length,
  };
  const dayMap = new Map<string, DayRecord>();
  for (const e of events) {
    switch (e.type) {
      case "ProfileSet": s.profile = e.profile; break;
      case "SettingsChanged": s.settings = { ...s.settings, ...e.settings }; break;
      case "ContextTagged": s.tags[e.checkId] = e.tags; break;
      case "SymptomsReported": s.symptoms[e.checkId] = e.symptoms; break;
      case "CheckCompleted": {
        s.checks.push(e.result);
        const prev = dayMap.get(e.result.date);
        const rec = toDayRecord(e.result);
        // Latest check of the day wins, but keep values from earlier checks that day.
        dayMap.set(e.result.date, prev ? {
          ...rec,
          values: { ...prev.values, ...rec.values },
          statuses: { ...prev.statuses, ...rec.statuses },
          aboveBand: { ...prev.aboveBand, ...rec.aboveBand },
          belowBand: { ...prev.belowBand, ...rec.belowBand },
        } : rec);
        break;
      }
      case "BaselineUpdated": s.baselines[e.baseline.indicator] = e.baseline; break;
      case "MessageQueued": s.outbox.push(e.message); break;
      case "CmoAlerted": s.cmoAlerts.push({ ts: e.ts, checkId: e.checkId, reason: e.reason }); break;
      case "ReadingRecorded": break;
    }
  }
  s.checks.sort((a, b) => a.ts.localeCompare(b.ts));
  s.days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  return s;
}

// ------------------------------------------------------------------ derived

export function checksOn(s: AppState, date: string): CheckResult[] {
  return s.checks.filter((c) => c.date === date);
}

export function historyBefore(s: AppState, date: string): DayRecord[] {
  return s.days.filter((d) => d.date < date);
}

/** Consecutive days with a completed check, ending today (or yesterday if not yet checked today). */
export function streak(s: AppState, today: string): number {
  const dates = new Set(s.checks.map((c) => c.date));
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export interface Badge { id: string; name: string; earned: boolean; detail: string }

export function badges(s: AppState, today: string): Badge[] {
  const lastN = (n: number) => Array.from({ length: n }, (_, k) => s.days.find((d) => d.date === addDays(today, -k)));
  const sleepNights = lastN(8).slice(0, 8).filter((d) => d && d.values.sleep !== undefined);
  const keeper = sleepNights.slice(0, 7).length === 7 && sleepNights.slice(0, 7).every((d) => d!.values.sleep! >= 7);
  const steadyDays = lastN(14);
  const steady = steadyDays.every((d) => d && d.values.hr !== undefined && !d.aboveBand.hr && !d.belowBand.hr);
  return [
    { id: "circadian", name: "Circadian Keeper", earned: keeper, detail: "7 nights in a row with 7 h of sleep or more" },
    { id: "honest", name: "Honest Logger", earned: s.checks.length >= 30, detail: `30 checks logged (${Math.min(s.checks.length, 30)}/30)` },
    { id: "steady", name: "Steady Heart", earned: steady, detail: "14 days with resting heart rate inside your normal" },
  ];
}

/** Latest valid value per indicator (pre-fill, FR-11). */
export function latestValues(s: AppState): Partial<Record<Indicator, number>> {
  const out: Partial<Record<Indicator, number>> = {};
  for (const d of s.days) Object.assign(out, d.values);
  return out;
}

/** Instrument measurements that cost crew time; HR, sleep and mood are one tap and always asked. */
export const ADAPTIVE: Indicator[] = ["bp_sys", "bp_dia", "glucose", "temp"];

/**
 * Adaptive frequency (FR-12): an instrument indicator green for its last 7
 * recorded days and measured within the last 2 days can be skipped today.
 * Yellow, red, learning or "unwell" always asks.
 */
export function dueIndicators(s: AppState, today: string, unwell = false): { due: Indicator[]; resting: Indicator[] } {
  if (unwell) return { due: [...INDICATORS], resting: [] };
  const due: Indicator[] = [];
  const resting: Indicator[] = [];
  for (const i of INDICATORS) {
    if (!ADAPTIVE.includes(i)) { due.push(i); continue; }
    const pair = i === "bp_dia" ? "bp_sys" : i; // blood pressure is asked as one tile
    const recent = s.days.filter((d) => d.values[pair] !== undefined && d.date < today).slice(-7);
    const steady = recent.length === 7 && recent.every((d) => d.statuses[pair] === "green") && (s.baselines[pair]?.ready ?? false);
    const last = recent.at(-1)?.date;
    const fresh = last !== undefined && last >= addDays(today, -2);
    (steady && fresh ? resting : due).push(i);
  }
  return { due, resting };
}

// ------------------------------------------------------------------ outbox view

export type OutboxState = "in-transit" | "delivered" | "held";

export function outboxView(m: OutboxMessage, nowMs: number, today: string): { state: OutboxState; eta?: string; minutesLeft?: number } {
  let eta = m.eta;
  if (m.held) {
    if (!m.heldUntil || today < m.heldUntil) return { state: "held" };
    // Released when the blackout ended: sent at 00:00 that day.
    eta = new Date(Date.parse(`${m.heldUntil}T00:00:00Z`) + oneWayMin(m.heldUntil) * 60_000).toISOString();
  }
  if (!eta) return { state: "held" };
  const left = (Date.parse(eta) - nowMs) / 60_000;
  return left > 0 ? { state: "in-transit", eta, minutesLeft: left } : { state: "delivered", eta };
}
