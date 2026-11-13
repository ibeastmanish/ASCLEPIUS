// Ground Station console logic: verify arriving packets, reject replays, sign replies.
// Storage: its OWN IndexedDB database ("asclepius-ground"), separate from the crew
// vault ("hygiea"). The station's private keys are kept here and nowhere else.
import Dexie, { type Table } from "dexie";
import { RULES } from "../engine/rules";
import { oneWayMin as lightTime } from "../engine/horizons";
import {
  fingerprint, openVerified, sameKey, SealError, sha256Hex, signJSON,
  type CrewKeyBundle, type SealFailure,
} from "../storage/crypto";
import { DEMO_STATION, type StationKeys } from "./demoKeys";
import { seqKey, type DsnPacket, type DsnReply, type ReplyBody } from "./protocol";

export type VerdictStatus = "accepted" | "rejected" | "unpaired" | "unreadable";

export interface Verdict {
  status: VerdictStatus;
  /** Which check failed, for rejected packets. */
  stage?: SealFailure | "replay" | "crew-mismatch";
  reason: string;
  summary?: Record<string, unknown>;
  /** SHA-256 of the signed body (the exact snapshot the crew signed). */
  bodyHash?: string;
  seq?: number;
  crewFingerprint?: string;
  /** Replay-register key, for accepted packets. */
  replayKey?: string;
}

/** Trusted crew signing keys, by crew id. */
export type CrewRegistry = Record<string, CrewKeyBundle>;

/**
 * Open and check one arrived packet:
 *   1. the crew id must be paired (its public signing key known to the station),
 *   2. AES-GCM decryption with the station private key,
 *   3. ECDSA signature over the body with the PAIRED crew key (not the key in the packet),
 *   4. the signed crew id must match the routing header,
 *   5. the signed sequence number must not have been accepted before (replay).
 */
export async function verifyPacket(p: DsnPacket, keys: StationKeys, crews: CrewRegistry, seen: ReadonlySet<string>): Promise<Verdict> {
  if (p.alg === "hermes") {
    return { status: "unreadable", reason: "Sealed with Hermes OpenPGP (desktop build). Open it in the ASCLEPIUS desktop app." };
  }
  const paired = crews[p.crew];
  if (!paired) {
    return { status: "unpaired", reason: `Crew ${p.crew} is not paired with this station. Check the key fingerprint with the crew before trusting it.` };
  }
  const crewFingerprint = await fingerprint(paired.sign);
  try {
    const { summary, bodyHash } = await openVerified(p.payload, { groundPrivateJwk: keys.encPrivateJwk, crewPublicJwk: paired.sign });
    const s = summary as Record<string, unknown>;
    if (s.crew !== p.crew) {
      return { status: "rejected", stage: "crew-mismatch", reason: `Signed crew id (${String(s.crew)}) does not match the header (${p.crew}).`, crewFingerprint };
    }
    const seq = Number(s.seq) || 0;
    const replayKey = seq > 0 ? seqKey(crewFingerprint, seq) : `hash:${bodyHash}`;
    if (seen.has(replayKey)) {
      return {
        status: "rejected", stage: "replay", seq, crewFingerprint, bodyHash,
        reason: seq > 0
          ? `Replay: sequence #${seq} from this crew key was already accepted. A valid old message re-sent later is refused.`
          : "Replay: this exact signed message was already accepted.",
      };
    }
    return { status: "accepted", reason: "Decrypted with the station key. Crew signature valid. New sequence number.", summary: s, bodyHash, seq, crewFingerprint, replayKey };
  } catch (e) {
    const stage = e instanceof SealError ? e.stage : "decrypt";
    return { status: "rejected", stage, reason: (e as Error).message, crewFingerprint };
  }
}

/** SHA-256 of the rule set this console ships with (the crew signs the same hash). */
let rulesHashP: Promise<string> | undefined;
export function groundRulesHash(): Promise<string> {
  rulesHashP ??= sha256Hex(JSON.stringify(RULES));
  return rulesHashP;
}
export const GROUND_RULES_VERSION = RULES.version;

/** Build and sign the flight surgeon's reply. `arrivedReal` = when the packet reached the console. */
export async function makeReply(
  p: DsnPacket, v: Verdict, text: string, surgeon: string, keys: StationKeys,
  o: { nowReal: number; arrivedReal: number; warp: number; holdMs: number },
): Promise<DsnReply> {
  const mission = p.mission ?? "mars";
  // Mission-clock "now" at the ground: send time + link time + real time spent at the console.
  const dwellMs = Math.max(0, o.nowReal - o.arrivedReal);
  const sentAtMs = Date.parse(p.sentAt) + o.holdMs + dwellMs;
  const sentAt = new Date(sentAtMs).toISOString();
  const back = lightTime(sentAt.slice(0, 10), mission);
  const body: ReplyBody = {
    inReplyTo: p.id, inReplyToSeq: v.seq ?? 0, crew: p.crew, text: text.trim().slice(0, 600), surgeon: surgeon.trim().slice(0, 60) || "Flight surgeon",
    sentAt, oneWayMin: back, answerAfterMin: (o.holdMs + dwellMs) / 60_000 + back,
  };
  return {
    asclepius: "dsn-reply", v: 1, id: `reply-${p.id}-${Math.round(o.nowReal).toString(36)}`, inReplyTo: p.id, crew: p.crew,
    sentAtReal: o.nowReal, warp: o.warp, signed: await signJSON(body, keys.signPrivateJwk),
  };
}

// ------------------------------------------------------------------ persistence (console only)
export interface PacketRow {
  id: string;
  packet: DsnPacket;
  /** Real time the console first heard the packet on the link. */
  heardAt: number;
  verdict?: Verdict;
  /** Real time it was opened (arrival). */
  arrivedAt?: number;
}

export interface MetaRow { key: string; value: unknown }

export class GroundDB extends Dexie {
  packets!: Table<PacketRow, string>;
  replies!: Table<DsnReply, string>;
  meta!: Table<MetaRow, string>;
  constructor(name = "asclepius-ground") {
    super(name);
    this.version(1).stores({ packets: "id", replies: "id, inReplyTo", meta: "key" });
  }
}

export interface StationState {
  keys: StationKeys;
  demo: boolean;
  crews: CrewRegistry;
  surgeon: string;
}

export async function loadStation(db: GroundDB): Promise<StationState> {
  const get = async <T,>(k: string) => (await db.meta.get(k))?.value as T | undefined;
  const keys = (await get<StationKeys>("station")) ?? DEMO_STATION;
  return {
    keys,
    demo: sameKey(keys.bundle.enc, DEMO_STATION.bundle.enc),
    crews: (await get<CrewRegistry>("crews")) ?? {},
    surgeon: (await get<string>("surgeon")) ?? "Dr. R. Iyer (flight surgeon, simulated)",
  };
}

export async function saveMeta(db: GroundDB, key: string, value: unknown) {
  await db.meta.put({ key, value });
}
