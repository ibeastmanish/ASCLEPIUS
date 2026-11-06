import raw from "./rules.json";
import type { ContextTag, Indicator, Region, Status, Symptom } from "./types";

export interface Cond { gt?: number; gte?: number; lt?: number; lte?: number }
export interface RedFlagRule extends Cond { ruleId: string; text: string; source: string }
export interface IndicatorRules {
  label: string;
  short: string;
  unit: string;
  region: Region;
  step: number;
  decimals: number;
  valid: Cond & { ruleId: string };
  redflags: RedFlagRule[];
  clinical: { ruleId: string; green: Cond; source: string };
  personal: { ruleId: string; minHalfWidth: number; direction: "both" | "low" | "high"; clearsClinicalLow?: boolean; clearsNote?: string };
  guidance: Record<"green" | "yellow" | "red", string>;
}
export interface ContextRule { label: string; skipPersonal: Indicator[]; minutes?: number; tip?: string; lowerCmoThreshold?: boolean }
export interface Rules {
  version: string;
  indicators: Record<Indicator, IndicatorRules>;
  symptoms: { ruleId: string; source: string; list: Record<Symptom, string> };
  context: Record<ContextTag, ContextRule>;
  trends: {
    "TR-SLEEP-3": { indicator: "sleep"; days: number; lt: number; status: Status; source: string };
    "TR-SLEEP-RED": { indicator: "sleep"; days: number; lt: number; status: Status; source: string };
    "TR-MOOD-3": { indicator: "mood"; days: number; belowMedianBy: number; status: Status; source: string };
    "TR-HR-3": { indicator: "hr"; days: number; aboveBand: boolean; status: Status; source: string };
  };
  patterns: {
    "PT-FATIGUE": { label: string; regions: Region[]; guidance: string; tellCmo: boolean; source: string };
    "PT-FEVER": { label: string; regions: Region[]; guidance: string; feverGte: number; tellCmo: boolean; source: string };
  };
  baseline: { learningChecks: number; window: number; madScale: number; k: number; ewmaAlpha: number };
}

export const RULES = raw as unknown as Rules;

/** True when `v` satisfies every bound present in `c`. */
export function matches(v: number, c: Cond): boolean {
  if (c.gt !== undefined && !(v > c.gt)) return false;
  if (c.gte !== undefined && !(v >= c.gte)) return false;
  if (c.lt !== undefined && !(v < c.lt)) return false;
  if (c.lte !== undefined && !(v <= c.lte)) return false;
  return true;
}

/** Human-readable range for a condition, e.g. "60-100", "under 130", "7 or more". */
export function describe(c: Cond, unit = ""): string {
  const u = unit ? (unit.startsWith("/") ? unit : ` ${unit}`) : "";
  const lo = c.gte ?? c.gt;
  const hi = c.lte ?? c.lt;
  if (lo !== undefined && hi !== undefined) {
    // Show an exclusive upper bound the way people read it: "< 100" -> "99", "< 38.0" -> "37.9".
    const d = Math.max(...[lo, hi].map((x) => (String(x).split(".")[1] ?? "").length));
    const top = c.lt !== undefined ? (hi - 10 ** -d).toFixed(d) : hi;
    return `${lo}-${top}${u}`;
  }
  if (c.gte !== undefined) return `${c.gte}${u} or more`;
  if (c.gt !== undefined) return `over ${c.gt}${u}`;
  if (c.lt !== undefined) return `under ${c.lt}${u}`;
  if (c.lte !== undefined) return `${c.lte}${u} or less`;
  return "any";
}

export function fmt(ind: Indicator, v: number, rules: Rules = RULES): string {
  return v.toFixed(rules.indicators[ind].decimals);
}

const ORDER: Record<Status, number> = { invalid: -1, green: 0, yellow: 1, red: 2 };
/** Worst of two statuses. `invalid` never wins over a real colour. */
export function worst(a: Status, b: Status): Status {
  return ORDER[b] > ORDER[a] ? b : a;
}
export function rank(s: Status): number {
  return ORDER[s];
}
