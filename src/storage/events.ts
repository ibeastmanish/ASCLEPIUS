import type { EyeCheck } from "../engine/eyes";
// Append-only event log (PRD 8.1). Current state is always rebuilt from these.
import type { Baseline, CheckResult, ContextTag, Indicator, MissionSetting, Symptom } from "../engine/types";

export interface Profile {
  crewId: string;
  name: string;
  role: string;
  mission: MissionSetting;
  /** Launch date, YYYY-MM-DD. Checks before it are pre-flight (learning). */
  launchDate: string;
  /** East longitude of the base, for Mars-sol reminders. */
  baseLonE: number;
  simulated?: boolean;
}

export interface Settings {
  /** Mission-clock date override (YYYY-MM-DD) for demos and blackout tests; empty = real today. */
  dateOverride?: string;
  reminderHour: number;
  /** UI language for the daily check ("te" = Telugu draft, "hi" = Hindi draft). */
  lang?: "en" | "te" | "hi";
  /**
   * "Delay is delay" Earth mode (PRD v3 S2): the far end is a rural clinic, the
   * link is travel time to its doctor, and the clinic's opening hours replace the
   * flight surgeon's shift. Light time from JPL Horizons is not used in this mode.
   */
  clinic?: ClinicSetting;
  /** Cabin CO2, mmHg, as last entered or read (Crew Pulse). */
  cabinCo2?: number;
}

export interface ClinicSetting {
  on: boolean;
  /** One-way travel time to the nearest doctor, minutes. */
  travelMin: number;
  /** Clinic hours in local time, 24 h clock. */
  openHour: number;
  closeHour: number;
  /** Local time zone offset from UTC in minutes (IST = 330). */
  tzOffsetMin: number;
  name: string;
}

export interface OutboxMessage {
  id: string;
  kind: "red-alert" | "digest";
  priority: number; // 0 = red alert, 1 = digest
  checkId: string;
  createdAt: string;
  /** Date the message was created on the mission clock. */
  date: string;
  /** Arrival on Earth (ISO), if sent now; undefined while held. */
  eta?: string;
  held: boolean;
  heldUntil?: string;
  oneWayMin: number;
  summary: Record<string, unknown>;
  payload: string;
  bytes: number;
  signed: boolean;
  encrypted: boolean;
  /** Missing on messages saved before the desktop build existed: those are WebCrypto. */
  alg?: "webcrypto" | "hermes";
}

export type HEvent =
  | { type: "ProfileSet"; ts: string; profile: Profile }
  | { type: "SettingsChanged"; ts: string; settings: Partial<Settings> }
  | { type: "ReadingRecorded"; ts: string; id: string; checkId: string; crewId: string; date: string; day: number;
      indicator: Indicator; value: number; unit: string; input: "typed" | "tapped" | "photo" | "bluetooth" | "seed" }
  | { type: "ContextTagged"; ts: string; checkId: string; tags: ContextTag[] }
  | { type: "SymptomsReported"; ts: string; checkId: string; symptoms: Symptom[] }
  | { type: "CheckCompleted"; ts: string; result: CheckResult }
  | { type: "BaselineUpdated"; ts: string; checkId: string; baseline: Baseline }
  | { type: "MessageQueued"; ts: string; message: OutboxMessage }
  | { type: "CmoAlerted"; ts: string; checkId: string; reason: string }
  | { type: "EyeCheckRecorded"; ts: string; check: EyeCheck };

export type HEventType = HEvent["type"];
