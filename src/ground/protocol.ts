// Deep Space Network link between the crew tablet and the Ground Station console.
// Demo transport: BroadcastChannel("asclepius-dsn") between two tabs of the same
// browser, or copy/paste / file drop of the packet JSON. Pure functions here are
// shared by both pages and covered by tests.
import { earthFor } from "../engine/horizons";
import type { MissionSetting, Status } from "../engine/types";
import type { CrewKeyBundle, SignedJSON } from "../storage/crypto";
import type { OutboxMessage } from "../storage/events";

export const DSN_CHANNEL = "asclepius-dsn";
const MIN = 60_000;

/** A sealed crew message on the wire. Everything outside `payload` is unsigned routing data. */
export interface DsnPacket {
  asclepius: "dsn-packet";
  v: 1;
  id: string;
  kind: "red-alert" | "digest";
  priority: number;
  crew: string;
  name: string;
  /** Mission-clock date the message was sealed on (picks the light time). */
  missionDate: string;
  mission: MissionSetting;
  /** Mission-clock send time (ISO). */
  sentAt: string;
  /** Real (wall-clock) send time in ms: the console holds the packet against this. */
  sentAtReal: number;
  payload: string;
  alg: "webcrypto" | "hermes";
  bytes: number;
  /** Sender's public signing key, as a pairing hint only. Never trusted on its own. */
  crewKey: CrewKeyBundle;
  simulated: boolean;
  /** Set by the console's replay test: injected at the ground antenna, no light-time hold. */
  injected?: boolean;
}

/** The flight surgeon's reply, signed with the ground station key. */
export interface ReplyBody {
  inReplyTo: string;
  inReplyToSeq: number;
  crew: string;
  text: string;
  surgeon: string;
  /** Mission-clock reply time (ISO). */
  sentAt: string;
  /** One-way light time for the return trip (minutes). */
  oneWayMin: number;
  /** Total link time from the crew's send to this reply's arrival, in minutes (mission time, unwarped). */
  answerAfterMin: number;
}

export interface DsnReply {
  asclepius: "dsn-reply";
  v: 1;
  id: string;
  inReplyTo: string;
  crew: string;
  /** Real send time (ms) and the demo time warp in force: the crew holds the reply until sentAtReal + light time / warp. */
  sentAtReal: number;
  warp: number;
  signed: SignedJSON;
}

export type DsnMessage =
  | { t: "packet"; packet: DsnPacket }
  | { t: "reply"; reply: DsnReply }
  /** "Here is what I already have; send me the rest." */
  | { t: "sync"; from: "crew" | "ground"; have: string[] }
  | { t: "ack"; ids: string[] };

/** Build the wire packet for an outbox message. `clockOffsetMs` = mission clock minus real clock. */
export function toPacket(m: OutboxMessage, crewKey: CrewKeyBundle, mission: MissionSetting, clockOffsetMs: number): DsnPacket {
  return {
    asclepius: "dsn-packet", v: 1, id: m.id, kind: m.kind, priority: m.priority,
    crew: String(m.summary.crew ?? crewKey.crew), name: String(m.summary.name ?? crewKey.name),
    missionDate: m.date, mission, sentAt: m.createdAt, sentAtReal: Date.parse(m.createdAt) - clockOffsetMs,
    payload: m.payload, alg: m.alg ?? "webcrypto", bytes: m.bytes, crewKey, simulated: !!m.summary.simulated,
  };
}

export function isPacket(x: unknown): x is DsnPacket {
  const p = x as DsnPacket;
  return !!p && p.asclepius === "dsn-packet" && typeof p.payload === "string" && typeof p.id === "string" && typeof p.sentAt === "string";
}
export function isReply(x: unknown): x is DsnReply {
  const r = x as DsnReply;
  return !!r && r.asclepius === "dsn-reply" && typeof r.id === "string" && !!r.signed?.body && !!r.signed?.sig;
}

type EarthFn = (date: string, mission?: MissionSetting) => { oneWayMin: number; blackout: boolean; blackoutEnd?: string };

export interface Release {
  /** Total time the link holds the packet (mission time, unwarped), in ms. */
  holdMs: number;
  /** Real time (ms) the console releases it, after the time warp. */
  releaseMs: number;
  oneWayMin: number;
  heldForBlackout: boolean;
  blackoutEnd?: string;
}

/**
 * When does a packet reach Earth? sentAt + one-way light time for its mission
 * date (JPL Horizons), or, during a Sun blackout, the blackout's end plus the
 * light time on that day. `warp` (1 or 60) only shortens the wait in the demo.
 */
export function releaseAt(p: Pick<DsnPacket, "sentAt" | "sentAtReal" | "missionDate" | "mission"> & { injected?: boolean }, warp = 1, earth: EarthFn = earthFor): Release {
  if (p.injected) return { holdMs: 0, releaseMs: p.sentAtReal, oneWayMin: 0, heldForBlackout: false };
  const e = earth(p.missionDate, p.mission);
  let holdMs: number;
  let oneWay = e.oneWayMin;
  if (e.blackout && e.blackoutEnd) {
    oneWay = earth(e.blackoutEnd, p.mission).oneWayMin;
    holdMs = Math.max(0, Date.parse(`${e.blackoutEnd}T00:00:00Z`) - Date.parse(p.sentAt)) + oneWay * MIN;
  } else {
    holdMs = oneWay * MIN;
  }
  return { holdMs, releaseMs: p.sentAtReal + holdMs / Math.max(1, warp), oneWayMin: oneWay, heldForBlackout: e.blackout, blackoutEnd: e.blackoutEnd };
}

/** When the crew sees a ground reply (real ms). */
export function replyReleaseAt(r: Pick<DsnReply, "sentAtReal" | "warp">, oneWayMin: number): number {
  return r.sentAtReal + (oneWayMin * MIN) / Math.max(1, r.warp);
}

// ------------------------------------------------------------------ triage
export type Triage = 0 | 1 | 2 | 3;
export const TRIAGE_LABEL: Record<Triage, string> = {
  0: "Red: act now",
  1: "Persistent yellow / tell CMO",
  2: "Yellow",
  3: "Daily digest",
};

/** Red first, then persistent yellow / tell-cmo, then other yellow, then digests. */
export function triage(s: { kind?: unknown; overall?: unknown; escalation?: unknown; rules?: unknown; patterns?: unknown }): Triage {
  const overall = s.overall as Status;
  if (s.kind === "red-alert" || overall === "red" || s.escalation === "alert-cmo-and-earth") return 0;
  const rules = Array.isArray(s.rules) ? (s.rules as string[]) : [];
  const persistent = s.escalation === "tell-cmo" || rules.some((r) => r.startsWith("TR-")) || (Array.isArray(s.patterns) && s.patterns.length > 0);
  if (overall === "yellow" && persistent) return 1;
  if (s.escalation === "tell-cmo") return 1;
  if (overall === "yellow") return 2;
  return 3;
}

// ------------------------------------------------------------------ replay protection
/** Key for the replay register: crew key fingerprint + signed sequence number. */
export function seqKey(crewFingerprint: string, seq: number): string {
  return `${crewFingerprint.replace(/\s/g, "")}#${seq}`;
}

export function fmtHold(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}
