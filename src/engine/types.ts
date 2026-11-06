// HYGIEA engine contract (PRD section 8.4). Pure data types shared by the
// engine worker, the storage layer and the UI.

export type Indicator = "bp_sys" | "bp_dia" | "hr" | "glucose" | "temp" | "sleep" | "mood" | "crt";
export type Status = "green" | "yellow" | "red" | "invalid";
export type Layer = "validity" | "redflag" | "clinical" | "personal" | "trend" | "pattern" | "context";
export type Region = "brain" | "heart" | "blood" | "skin";
export type ContextTag = "exercise" | "eva" | "caffeine" | "medication" | "woke" | "unwell";
export type Symptom = "chest_pain" | "breathing" | "fainting" | "weakness" | "confusion" | "headache";
export type Escalation = "none" | "recheck" | "tell-cmo" | "alert-cmo-and-earth";
export type MissionSetting = "mars" | "moon" | "iss";

/** The six indicators named in the challenge brief, plus the optional camera-based perfusion check (CRT). */
export const INDICATORS: Indicator[] = ["bp_sys", "bp_dia", "hr", "glucose", "temp", "sleep", "mood", "crt"];
/** The six required daily readings, unaffected by the optional CRT add-on. */
export const CORE_INDICATORS: Indicator[] = ["bp_sys", "bp_dia", "hr", "glucose", "temp", "sleep", "mood"];

/** One reason behind a colour. Every result carries at least one. */
export interface Why {
  ruleId: string;
  layer: Layer;
  indicator?: Indicator;
  value?: number;
  low?: number;
  high?: number;
  source: string;
  /** Plain-language sentence for the "Why this colour?" panel. */
  text: string;
}

export interface IndicatorResult {
  indicator: Indicator;
  value: number;
  status: Status;
  why: Why[];
  guidanceId?: string;
  /** Which side of normal the value sits on, used to pick low/high guidance. */
  side?: "low" | "high";
  /** Personal band at the time of the check, when it was ready and used. */
  band?: { low: number; high: number; position: "below" | "inside" | "above" };
  /** Learning progress when the personal band is not ready yet. */
  learning?: { n: number; need: number };
}

export interface PatternResult {
  id: string; // e.g. "PT-FATIGUE"
  status: Status;
  indicators: Indicator[];
  regions: Region[];
  why: Why[];
  guidanceId: string;
  tellCmo: boolean;
}

export interface CheckResult {
  checkId: string;
  ts: string;
  date: string; // mission-clock calendar date, YYYY-MM-DD
  day: number; // mission day (1 = launch day; <= 0 is pre-flight)
  overall: Status;
  results: IndicatorResult[];
  patterns: PatternResult[];
  escalation: Escalation;
  escalationWhy: string[];
  earthEta?: string;
  earthHeld?: boolean;
  rulesVersion: string;
}

/** A personal baseline for one indicator (PRD 7.4). */
export interface Baseline {
  indicator: Indicator;
  /** Learning window: up to the last 30 accepted values. */
  window: number[];
  n: number;
  ready: boolean;
  median: number;
  spread: number;
  half: number;
  /** Band centre; equals the median until in-flight EWMA updates move it. */
  center: number;
  low: number;
  high: number;
}

export type Baselines = Partial<Record<Indicator, Baseline>>;

/** One past day, as the trend rules see it (latest check of that day). */
export interface DayRecord {
  date: string;
  day: number;
  values: Partial<Record<Indicator, number>>;
  statuses: Partial<Record<Indicator, Status>>;
  /** Per-indicator: was the value outside the personal band on the high side / low side? */
  aboveBand: Partial<Record<Indicator, boolean>>;
  belowBand: Partial<Record<Indicator, boolean>>;
}

export interface CheckInput {
  checkId: string;
  ts: string;
  date: string;
  day: number;
  values: Partial<Record<Indicator, number>>;
  tags: ContextTag[];
  symptoms: Symptom[];
}

export interface EngineContext {
  baselines: Baselines;
  /** Previous days, any order; the engine looks up by date. Must not include `input.date`. */
  history: DayRecord[];
  /** Earlier checks on the same date (for TR-REPEAT), oldest first. */
  earlierToday: CheckResult[];
  /** Earth link for today's date. */
  earth: { oneWayMin: number; blackout: boolean; blackoutEnd?: string };
}
