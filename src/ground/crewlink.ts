// Crew side of the demo DSN link: sends sealed packets to the Ground Station
// console over BroadcastChannel and receives signed replies. Replies are kept in
// memory only (the console keeps the durable copy and re-sends on sync).
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { missionNow } from "../app/clock";
import { useApp } from "../app/store";
import { publicOnly, verifyJSON, type CrewKeyBundle, type KeyRing } from "../storage/crypto";
import { pairedGround } from "../storage/earthlink";
import { DSN_CHANNEL, isReply, replyReleaseAt, toPacket, type DsnMessage, type DsnPacket, type DsnReply, type ReplyBody } from "./protocol";

export interface CrewReply {
  reply: DsnReply;
  ok: boolean;
  body?: ReplyBody;
  error?: string;
  /** Real ms when it reaches the crew. */
  arrivesAt: number;
}

let channel: BroadcastChannel | null = null;
let packets: DsnPacket[] = [];
const acked = new Set<string>();
const replies = new Map<string, CrewReply>();
let groundHeard = 0;
let version = 0;
const listeners = new Set<() => void>();
let verifyKey: JsonWebKey | undefined;

function bump() {
  version++;
  for (const l of listeners) l();
}

function post(m: DsnMessage) {
  try { channel?.postMessage(m); } catch { /* channel closed */ }
}

function sendPending() {
  for (const p of packets) if (!acked.has(p.id)) post({ t: "packet", packet: p });
}

/** Verify and keep a reply (from the channel or pasted). */
export async function acceptReply(r: DsnReply): Promise<CrewReply> {
  const known = replies.get(r.id);
  if (known) return known;
  let out: CrewReply;
  if (!verifyKey) {
    out = { reply: r, ok: false, error: "No ground station key paired", arrivesAt: r.sentAtReal };
  } else {
    try {
      const body = await verifyJSON<ReplyBody>(r.signed, verifyKey);
      out = { reply: r, ok: true, body, arrivesAt: replyReleaseAt(r, body.oneWayMin) };
    } catch (e) {
      out = { reply: r, ok: false, error: `Rejected: ${(e as Error).message}. Not signed by the paired ground station.`, arrivesAt: r.sentAtReal };
    }
  }
  replies.set(r.id, out);
  bump();
  return out;
}

function start() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(DSN_CHANNEL);
  channel.onmessage = (ev: MessageEvent<DsnMessage>) => {
    const m = ev.data;
    if (!m || typeof m !== "object") return;
    if (m.t === "sync" && m.from === "ground") {
      groundHeard = Date.now();
      acked.clear();
      for (const id of m.have) acked.add(id);
      sendPending();
      post({ t: "sync", from: "crew", have: [...replies.keys()] });
      bump();
    } else if (m.t === "ack") {
      groundHeard = Date.now();
      for (const id of m.ids) acked.add(id);
      bump();
    } else if (m.t === "reply" && isReply(m.reply)) {
      groundHeard = Date.now();
      void acceptReply(m.reply);
    }
  };
  post({ t: "sync", from: "crew", have: [...replies.keys()] });
}

export function crewKeyBundle(ring: KeyRing, crew: string, name: string): CrewKeyBundle {
  return { asclepius: "crew-key", v: 1, crew, name, sign: publicOnly(ring.crewSign.publicJwk) };
}

/**
 * Keep the link up while mounted: sends every outbox packet the console has not
 * acknowledged and collects replies. Mount it once near the app root (and the
 * Outbox mounts it too, so the demo works from that screen alone).
 */
export function useCrewLink() {
  const { state, store } = useApp();
  const [ring, setRing] = useState<KeyRing | null>(null);
  useEffect(() => { void store?.keyRing().then(setRing); }, [store]);
  const profile = state.profile;

  useEffect(() => {
    if (!ring || !profile) return;
    start();
    verifyKey = pairedGround(ring).signPublicJwk;
    const offset = missionNow(state.settings, new Date()).getTime() - Date.now();
    const key = crewKeyBundle(ring, profile.crewId, profile.name);
    packets = state.outbox.map((m) => toPacket(m, key, profile.mission, offset));
    sendPending();
    bump();
  }, [ring, profile, state.outbox, state.settings]);

  const v = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => version);
  return useMemo(() => ({
    ring,
    packets,
    replies: [...replies.values()],
    acked: new Set(acked),
    groundHeard,
    available: typeof BroadcastChannel !== "undefined",
    resync: () => { start(); post({ t: "sync", from: "crew", have: [...replies.keys()] }); sendPending(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [v, ring]);
}

/** After pairing with a different station: verify replies against its key from now on. */
export function resetReplies(ring: KeyRing) {
  verifyKey = pairedGround(ring).signPublicJwk;
  replies.clear();
  bump();
  post({ t: "sync", from: "crew", have: [] });
}
