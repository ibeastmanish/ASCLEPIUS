// Escalation ladder (PRD 7.6): none -> recheck -> tell CMO -> alert CMO + Earth.
import { RULES, type Rules } from "./rules";
import type { CheckResult, ContextTag, Escalation, IndicatorResult, PatternResult, Status } from "./types";

export interface EscalateInput {
  overall: Status;
  results: IndicatorResult[];
  patterns: PatternResult[];
  tags: ContextTag[];
  earlierToday: CheckResult[];
  earth: { oneWayMin: number; blackout: boolean; blackoutEnd?: string };
  now: string; // ISO timestamp of the check
  /** Days in the few days before this one that had any yellow or red reading (see rules.escalationRules). */
  priorYellowDays?: number;
}

export interface EscalateOutput {
  escalation: Escalation;
  why: string[];
  earthEta?: string;
  earthHeld?: boolean;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function escalate(e: EscalateInput, rules: Rules = RULES): EscalateOutput {
  if (e.overall === "red") {
    const why = ["Something needs help right away: the crew medical officer is alerted now."];
    if (e.earth.blackout) {
      why.push(`The Sun is between Mars and Earth. The Earth summary is held until ${e.earth.blackoutEnd ?? "the blackout ends"}.`);
      return { escalation: "alert-cmo-and-earth", why, earthHeld: true };
    }
    const eta = new Date(Date.parse(e.now) + e.earth.oneWayMin * 60_000).toISOString();
    why.push(`A summary is queued for Earth. It arrives in ${e.earth.oneWayMin.toFixed(1)} min; a reply takes ${(2 * e.earth.oneWayMin).toFixed(0)} min or more.`);
    return { escalation: "alert-cmo-and-earth", why, earthEta: eta, earthHeld: false };
  }

  if (e.overall === "yellow") {
    const why: string[] = [];
    const yellowNow = e.results.filter((r) => r.status === "yellow").map((r) => r.indicator);

    // TR-REPEAT: same indicator yellow at the earlier check today and now.
    const earlier = e.earlierToday.at(-1);
    if (earlier) {
      const repeated = yellowNow.filter((i) => earlier.results.some((r) => r.indicator === i && r.status === "yellow"));
      if (repeated.length) {
        const names = repeated.map((i) => rules.indicators[i].short.toLowerCase());
        why.push(`${cap(names.join(", "))} still yellow at the recheck. (TR-REPEAT)`);
      }
    }
    for (const p of e.patterns) if (p.tellCmo && p.status !== "green") why.push(`${rules.patterns[p.id as keyof Rules["patterns"]]?.label ?? "A pattern"} across several readings. (${p.id})`);
    // Persistence: a several-day trend, or yellow on most recent days, is not a one-off.
    if (rules.escalationRules.persistentTrendTellsCmo) {
      for (const r of e.results) for (const w of r.why) {
        if (w.layer === "trend" && r.status === "yellow") why.push(`${w.text} (${w.ruleId})`);
      }
    }
    const ry = rules.escalationRules.repeatYellow;
    if ((e.priorYellowDays ?? 0) >= ry.priorYellowDays) why.push(`Yellow on ${(e.priorYellowDays ?? 0) + 1} of the last ${ry.daysBack + 1} days. (${ry.ruleId})`);
    if (e.tags.some((t) => rules.context[t]?.lowerCmoThreshold)) why.push("You feel unwell, so any yellow is worth sharing.");
    if (e.results.some((r) => r.indicator === "mood" && r.value <= 1 && r.status !== "invalid")) why.push("Mood is at its lowest. Talking to someone helps.");

    if (why.length) return { escalation: "tell-cmo", why: ["Tell the crew medical officer today.", ...why] };
    return { escalation: "recheck", why: ["Do the steps on the card, then check again this evening."] };
  }

  return { escalation: "none", why: e.overall === "green" ? ["All good. No message is sent."] : [] };
}
