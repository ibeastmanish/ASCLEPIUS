import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel, fmtDate, utcHM } from "../app/clock";
import { useApp, videoOnce } from "../app/store";
import { HORIZONS_SOURCE, oneWayMin, series } from "../engine/horizons";
import { acceptReply, crewKeyBundle, resetReplies, useCrewLink, type CrewReply } from "../ground/crewlink";
import type { StationKeys } from "../ground/demoKeys";
import { fmtHold, isReply } from "../ground/protocol";
import { ASHA_TODAY } from "../seed/asha";
import {
  decryptFromCrew, fingerprint, forgeFromCrew, fromB64, groundFromBundle, newGroundKeys, newSigningKey, openVerified, SealError,
  sealForEarth, toB64, type GroundPublic,
} from "../storage/crypto";
import { open as openFromCrew, pairedGround, pairGround, parseGroundBundle } from "../storage/earthlink";
import type { OutboxMessage } from "../storage/events";
import { outboxView } from "../storage/projection";
import { G, StatusBadge, TopBar, chartColors, fmtMinutes, useDark } from "../ui/ui";
import { LinkTimeline } from "../ui/link";
import { EarthBanner } from "./Home";

const TA: CSSProperties = {
  width: "100%", minHeight: 96, padding: 10, border: 0, borderBottom: "2px solid var(--ink)", background: "var(--field)",
  color: "var(--ink)", fontFamily: "var(--mono)", fontSize: 13, resize: "vertical",
};
const GROUND_URL = `${import.meta.env.BASE_URL}ground.html`;

export function Outbox() {
  const app = useApp();
  const { state, now, today } = app;
  const [stamp, setStamp] = useState(0);
  const link = useCrewLink();

  // Video mode: a red alert row, then stamp the badges.
  useEffect(() => {
    if (app.video !== "outbox") return;
    (async () => {
      if (!state.outbox.some((m) => m.kind === "red-alert") && videoOnce("outbox")) {
        await app.submit({ values: { ...ASHA_TODAY, glucose: 48 }, tags: [], symptoms: [] });
        location.hash = "#/outbox";
      }
      setTimeout(() => setStamp((s) => s + 1), 900);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.video]);

  const msgs = [...state.outbox].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.priority - b.priority);
  const queued = msgs.filter((m) => outboxView(m, now.getTime(), today).state !== "delivered");
  const queue = [...queued].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <TopBar title="Earth outbox"><span>Red alerts first, then the daily digest</span></TopBar>
      <EarthBanner />
      <p className="intro">
        Deep-space links are slow and shared, so the most important message goes first: red alerts, then the daily digest.
        Every message is signed by your crew key and encrypted to the ground station&apos;s public key; only the ground station can open it.
        Times below come from the light delay alone, the physics minimum; waiting for a relay orbiter or a free Deep Space Network dish can add more.
      </p>
      <EarthAnswered replies={link.replies} msgs={state.outbox} />
      {queue.length > 0 && <p className="queue-order"><b>Send order:</b> {queue.map((m, k) => `${k + 1}. ${m.kind === "red-alert" ? "Red alert" : "Digest"}`).join(" · ")}</p>}
      {msgs.length === 0 && <div className="empty"><p>Nothing queued yet. Each day&apos;s first check adds a short digest; a red result adds an alert.</p></div>}
      <div className="msgs">
        {msgs.slice(0, 20).map((m) => (
          <MessageRow key={m.id} m={m} stamp={stamp} heard={link.acked.has(m.id)}
            reply={link.replies.find((r) => r.reply.inReplyTo === m.id)} />
        ))}
      </div>
      <GroundLink link={link} />
      <DelayChart />
    </>
  );
}

// ------------------------------------------------------------------ replies from Earth
function EarthAnswered({ replies, msgs }: { replies: CrewReply[]; msgs: OutboxMessage[] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (replies.length === 0) return null;
  const nowMs = Date.now();
  const sorted = [...replies].sort((a, b) => b.arrivesAt - a.arrivesAt);
  return (
    <section className="stack" style={{ marginBottom: 24 }} aria-live="polite">
      {sorted.map((r) => {
        const m = msgs.find((x) => x.id === r.reply.inReplyTo);
        const what = m ? `${m.kind === "red-alert" ? "red alert" : "daily digest"} of ${fmtDate(m.date)}` : "your message";
        if (!r.ok) {
          return (
            <div key={r.reply.id} className="banner banner-cmo" style={{ margin: 0 }} role="status">
              <span className="bi" aria-hidden="true">{G.cross}</span>
              <span><b>Reply rejected.</b> {r.error}</span>
            </div>
          );
        }
        const left = r.arrivesAt - nowMs;
        if (left > 0) {
          return (
            <div key={r.reply.id} className="banner" style={{ margin: 0 }} role="status">
              <span className="bi" aria-hidden="true">{G.send}</span>
              <span><b>Earth reply in transit</b> to your {what}: arrives in {fmtHold(left)}{r.reply.warp > 1 && <> (console time warp ×{r.reply.warp}, demo)</>}.</span>
            </div>
          );
        }
        const b = r.body!;
        return (
          <div key={r.reply.id} className="banner banner-ok" style={{ margin: 0, alignItems: "flex-start" }} role="status">
            <span className="bi" aria-hidden="true">{G.check}</span>
            <span className="stack" style={{ gap: 6 }}>
              <span><b>Earth answered</b> your {what}, {fmtMinutes(b.answerAfterMin)} after you sent it
                {" "}({fmtMinutes(b.oneWayMin)} light time back, signed by the ground station).</span>
              <span style={{ fontSize: 18 }}>&ldquo;{b.text}&rdquo;</span>
              <span className="small muted">{b.surgeon} · sent {utcHM(b.sentAt)}{r.reply.warp > 1 && <> · console time warp ×{r.reply.warp} (demo)</>} · Simulated crew data</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

// ------------------------------------------------------------------ pairing + link status
function GroundLink({ link }: { link: ReturnType<typeof useCrewLink> }) {
  const { state, store } = useApp();
  const [ground, setGround] = useState<GroundPublic | null>(null);
  const [fp, setFp] = useState("");
  const [paste, setPaste] = useState("");
  const [replyPaste, setReplyPaste] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [crewJson, setCrewJson] = useState("");
  const ring = link.ring;

  useEffect(() => {
    if (!ring) return;
    const g = pairedGround(ring);
    setGround(g);
    void fingerprint(g.publicJwk).then(setFp);
    if (state.profile) setCrewJson(JSON.stringify(crewKeyBundle(ring, state.profile.crewId, state.profile.name)));
  }, [ring, state.profile, msg]);

  async function pair(text: string | null) {
    try {
      const b = text === null ? null : parseGroundBundle(text);
      await pairGround(store, b);
      if (ring) resetReplies(ring);
      setPaste("");
      setMsg({ ok: true, text: b ? `Paired with ${b.name}. New messages are encrypted to its public key.` : "Back to the demo ground station." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  async function addReply() {
    try {
      const r = JSON.parse(replyPaste);
      if (!isReply(r)) throw new Error("That is not an ASCLEPIUS ground reply.");
      const out = await acceptReply(r);
      setReplyPaste("");
      setMsg(out.ok ? { ok: true, text: "Reply verified: signed by the paired ground station." } : { ok: false, text: out.error ?? "Rejected" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  const heard = link.groundHeard > 0;
  return (
    <section style={{ marginTop: 48 }}>
      <div className="chart-head"><h2>Ground station link</h2></div>
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="tags row" style={{ gap: 8 }}>
          <span className={`tag ${heard ? "tag-ok" : "tag-warn"}`}><span className="sw" />{heard ? "Ground console in contact" : link.available ? "Ground console not open" : "No tab link in this browser"}</span>
          {ground && <span className="tag"><span className="sw" />Paired: {ground.name ?? "Ground station"}{ground.demo ? " (demo keys)" : ""}</span>}
          {fp && <span className="tag mono">Key {fp}</span>}
        </div>
        <p className="small muted" style={{ maxWidth: "70ch" }}>
          This tablet holds only the ground station&apos;s <b>public</b> key. Open the <a href={GROUND_URL} target="_blank" rel="noopener">Ground Station console</a> in
          another tab of this browser: it receives each message after the real light time, opens it with its own private key and can sign a reply.
          {ground?.demo && <> The shipped <b>demo keys</b> are public knowledge and protect nothing; pair with your own station for real use.</>}
        </p>
        {msg && (
          <div className={`banner ${msg.ok ? "banner-ok" : "banner-cmo"}`} style={{ margin: 0 }} role="status">
            <span className="bi" aria-hidden="true">{msg.ok ? G.check : G.cross}</span><span>{msg.text}</span>
          </div>
        )}
        <details>
          <summary>Pair with a ground station (paste its public key)</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <label className="field"><span>Ground station public key (JSON from the console)</span>
              <textarea style={TA} value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} /></label>
            <div className="row">
              <button className="btn btn-primary" disabled={!paste.trim()} onClick={() => void pair(paste)}>Pair</button>
              <button className="btn" onClick={() => void pair(null)}>Use demo ground station</button>
            </div>
            <label className="field"><span>Your crew public key (paste into the console if it asks)</span>
              <textarea style={{ ...TA, minHeight: 64 }} readOnly value={crewJson} onFocus={(e) => e.currentTarget.select()} /></label>
          </div>
        </details>
        <details>
          <summary>No tab link? Paste a reply from the console</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <label className="field"><span>Signed reply (JSON)</span>
              <textarea style={TA} value={replyPaste} onChange={(e) => setReplyPaste(e.target.value)} spellCheck={false} /></label>
            <div className="row"><button className="btn" disabled={!replyPaste.trim()} onClick={() => void addReply()}>Verify reply</button></div>
          </div>
        </details>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ one message
type Step = { label: string; ok: boolean | null; detail?: string };
interface TestResult { title: string; ok: boolean; steps: Step[]; note?: string; json?: unknown }

/** Make the summary look harmless: what an attacker (or a bad relay) would want the ground to read. */
function softened(s: Record<string, unknown>): Record<string, unknown> {
  const readings = Object.fromEntries(Object.entries((s.readings as Record<string, [number, string]>) ?? {}).map(([k, [v]]) => [k, [k === "glucose" ? 98 : v, "green"]]));
  const results = Array.isArray(s.results) ? (s.results as Record<string, unknown>[]).map((r) => ({ ...r, v: r.i === "glucose" ? 98 : r.v, s: "green" })) : s.results;
  return { ...s, overall: "green", escalation: "none", escalationWhy: [], readings, results, rules: [], patterns: [] };
}

function MessageRow({ m, stamp, heard, reply }: { m: OutboxMessage; stamp: number; heard: boolean; reply?: CrewReply }) {
  const { now, today, store, security, state } = useApp();
  const v = outboxView(m, now.getTime(), today);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [webFp, setWebFp] = useState("");
  const [copied, setCopied] = useState("");
  const isHermes = m.alg === "hermes";
  const fp = isHermes ? security?.crewFingerprint ?? "" : webFp;
  const seq = Number(m.summary.seq) || 0;

  useEffect(() => {
    if (isHermes) return;
    store?.keyRing().then((r) => fingerprint(r.crewSign.publicJwk)).then(setWebFp);
  }, [store, isHermes]);

  /** Hermes (desktop) messages: open through the desktop app, flip a bit. */
  async function hermesTest(tamper: boolean) {
    if (!store) return;
    const ring = await store.keyRing();
    let payload = m.payload;
    if (tamper) {
      const b = fromB64(payload);
      b[b.length - 8] ^= 0x20;
      payload = toB64(b);
    }
    try {
      const json = await openFromCrew(payload, ring);
      setResult({ title: "Opened via Hermes", ok: true, steps: [{ label: "OpenPGP decrypt + signature", ok: true }], json });
    } catch (e) {
      setResult({ title: tamper ? "One bit flipped" : "Open", ok: false, steps: [{ label: "OpenPGP decrypt + signature", ok: false, detail: (e as Error).message }] });
    }
  }

  /**
   * Web build tests run as the ground station would. With the demo station we hold
   * its (public, demo) private key, so we open the bytes actually queued. Paired with
   * a real station, this tablet cannot decrypt, so the same summary is sealed to a
   * throwaway test station held in memory for this test only.
   */
  async function webTest(kind: "verify" | "body" | "forged" | "bit") {
    if (!store) return;
    const ring = await store.keyRing();
    const ground = pairedGround(ring);
    let station: StationKeys;
    let payload = m.payload;
    let note: string | undefined;
    if (ground.demo) {
      station = (await import("../ground/demoKeys")).DEMO_STATION;
      note = "Opened with the demo ground station's private key (demo keys, loaded for this test only).";
    } else {
      const t = await newGroundKeys("Throwaway test station");
      station = { bundle: t.bundle, encPrivateJwk: t.encPrivateJwk, signPrivateJwk: t.signPrivateJwk };
      payload = (await sealForEarth(m.summary, { ...ring, ground: groundFromBundle(t.bundle) })).payload;
      note = `This tablet is paired with ${ground.name ?? "a ground station"} and cannot read what it sent. The same summary was re-sealed to a throwaway test station for this demonstration.`;
    }
    const keys = { groundPrivateJwk: station.encPrivateJwk, crewPublicJwk: ring.crewSign.publicJwk };
    let title = "Decrypt and verify as Earth";
    const steps: Step[] = [];
    if (kind === "bit") {
      title = "One ciphertext bit flipped in transit";
      const b = fromB64(payload);
      b[b.length - 8] ^= 0x20;
      payload = toB64(b);
    } else if (kind === "body" || kind === "forged") {
      const forger = kind === "forged" ? await newSigningKey() : null;
      title = kind === "body" ? "Signed body changed after decryption" : "Changed body re-signed with a forged key";
      payload = (await forgeFromCrew(payload, station.encPrivateJwk, station.bundle.enc, softened, forger?.privateJwk)).payload;
      steps.push({
        label: "Attacker",
        ok: null,
        detail: kind === "body"
          ? "decrypted the message, changed it to read all green (glucose 48 → 98), kept the crew signature and re-encrypted it to the ground public key."
          : `changed it to read all green and signed it with their own key (${await fingerprint(forger!.publicJwk)}), then re-encrypted it to the ground public key.`,
      });
    }
    try {
      await decryptFromCrew(payload, station.encPrivateJwk);
      steps.push({ label: "Decryption (AES-GCM integrity)", ok: true, detail: "passed" });
    } catch (e) {
      steps.push({ label: "Decryption (AES-GCM integrity)", ok: false, detail: (e as Error).message });
      steps.push({ label: "Crew signature (ECDSA P-256)", ok: null, detail: "not reached" });
      setResult({ title, ok: false, steps, note });
      return;
    }
    try {
      const o = await openVerified(payload, keys);
      steps.push({ label: "Crew signature (ECDSA P-256)", ok: true, detail: `valid for crew key ${fp}` });
      steps.push({ label: "SHA-256 of signed snapshot", ok: true, detail: o.bodyHash.slice(0, 16) + "…" });
      setResult({ title, ok: true, steps, note, json: o.summary });
    } catch (e) {
      const sig = e instanceof SealError && e.stage === "signature";
      steps.push({ label: "Crew signature (ECDSA P-256)", ok: false, detail: sig ? (kind === "forged" ? `FAILED: not signed by this crew member's key (${fp}).` : "FAILED: the signed body was changed.") : (e as Error).message });
      setResult({ title, ok: false, steps, note });
    }
  }

  async function copyPacket() {
    if (!store || !state.profile) return;
    const ring = await store.keyRing();
    const { toPacket } = await import("../ground/protocol");
    const offset = now.getTime() - Date.now();
    const text = JSON.stringify(toPacket(m, crewKeyBundle(ring, state.profile.crewId, state.profile.name), state.profile.mission, offset));
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Packet copied. Paste or drop it into the Ground Station console.");
    } catch {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = `${m.id}.dsn.json`;
      a.click();
      setCopied("Packet saved as a file. Drop it into the Ground Station console.");
    }
  }

  return (
    <section className="msg-item">
      <div className="msg">
        <span className={`kind ${m.kind}`} aria-hidden="true">{m.kind === "red-alert" ? G.cross : G.digest}</span>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <span className="msg-title">{m.kind === "red-alert" ? "Red alert" : "Daily digest"}</span>
            <span className="small muted">{fmtDate(m.date)} · {dayLabel(Number(m.summary.day))} · {utcHM(m.createdAt)}{seq > 0 && <> · seq #{seq}</>}</span>
          </div>
          <div className="tags">
            {v.state === "held" && <span className="tag tag-held"><span className="sw" />Held: Sun blackout until {fmtDate(m.heldUntil!)}</span>}
            {v.state === "in-transit" && <span className="tag tag-blue"><span className="sw" />In transit · arrives in {fmtMinutes(v.minutesLeft!)}</span>}
            {v.state === "delivered" && <span className="tag tag-ok"><span className="sw" />Delivered {fmtDate(v.eta!.slice(0, 10))} · {utcHM(v.eta!)}</span>}
            <span key={`s${stamp}`} className={`tag ${m.signed ? "tag-ok" : "tag-warn"} stamp`}>{m.signed ? "Signed" : "Unsigned"}</span>
            <span key={`e${stamp}`} className={`tag ${m.encrypted ? "tag-ok" : "tag-warn"} stamp`} style={{ animationDelay: "0.25s" }}>{m.encrypted ? "Encrypted" : "Plain"}</span>
            <span className="tag">{m.bytes} bytes · {isHermes ? "OpenPGP (Hermes)" : "CBOR + gzip"}</span>
            {heard && <span className="tag tag-blue"><span className="sw" />On the console link</span>}
            {reply?.ok && reply.arrivesAt <= Date.now() && <span className="tag tag-ok"><span className="sw" />Earth answered</span>}
            <StatusBadge status={m.summary.overall as "green"} />
          </div>
          {v.eta && (() => {
            const ow = m.held && m.heldUntil ? oneWayMin(m.heldUntil) : m.oneWayMin;
            return <LinkTimeline sentMs={Date.parse(v.eta) - ow * 60_000} oneWayMin={ow} compact />;
          })()}
        </div>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Ground view"}</button>
      </div>
      {open && (
        <div className="ground">
          <p className="small muted">
            Algorithm: {isHermes
              ? <>OpenPGP via the team&apos;s Hermes library (Sequoia): Ed25519 signature by the crew key, X25519 encryption to the flight surgeon key (desktop build).</>
              : <>ECDSA P-256 signature by the crew key, then ECDH P-256 + AES-GCM 256 encryption to the ground station public key (WebCrypto, web build).</>}{" "}
            Crew key fingerprint <span className="mono">{fp}</span>.
            {!isHermes && <> Anyone can encrypt to the ground&apos;s public key, so only the <b>signature</b> proves who wrote the message and that it was not changed.</>}
          </p>
          {isHermes ? (
            <div className="row">
              <button className="btn btn-primary" onClick={() => void hermesTest(false)}>Decrypt and verify as Earth</button>
              <button className="btn" onClick={() => void hermesTest(true)}>Tamper test: flip one bit</button>
            </div>
          ) : (
            <div className="row">
              <button className="btn btn-primary" onClick={() => void webTest("verify")}>Decrypt and verify as Earth</button>
              <button className="btn" onClick={() => void webTest("body")}>Tamper test: change signed body</button>
              <button className="btn" onClick={() => void webTest("forged")}>Forged key test</button>
              <button className="btn" onClick={() => void webTest("bit")}>Flip one bit</button>
            </div>
          )}
          {result && (
            <div className={`banner ${result.ok ? "banner-ok" : "banner-cmo"}`} style={{ margin: 0, alignItems: "flex-start" }} role="status">
              <span className="bi" aria-hidden="true">{result.ok ? G.check : G.cross}</span>
              <span className="stack" style={{ gap: 6 }}>
                <b>{result.title}: {result.ok ? "accepted" : "rejected"}</b>
                {result.steps.map((s) => (
                  <span key={s.label} className="row" style={{ gap: 8, alignItems: "flex-start", flexWrap: "nowrap" }}>
                    <span style={{ width: 20, height: 20, flex: "none", display: "inline-grid", placeItems: "center" }} aria-hidden="true">
                      {s.ok === null ? G.dash : s.ok ? G.check : G.cross}
                    </span>
                    <span><b>{s.label}</b>{s.ok !== null && <> · {s.ok ? "passed" : "failed"}</>}{s.detail && <>: {s.detail}</>}</span>
                  </span>
                ))}
                {result.note && <span className="small muted">{result.note}</span>}
              </span>
            </div>
          )}
          {result?.json !== undefined && <pre className="json">{JSON.stringify(result.json, null, 2)}</pre>}
          <div className="row">
            <button className="btn" onClick={() => void copyPacket()}>Copy packet for the console</button>
            {copied && <span className="small muted" role="status">{copied}</span>}
          </div>
          <details><summary className="small">Ciphertext as sent (base64)</summary><pre className="json" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{m.payload}</pre></details>
        </div>
      )}
    </section>
  );
}

function DelayChart() {
  const { today } = useApp();
  const C = chartColors(useDark());
  const data = useMemo(() => series(), []);
  const black = data.filter((d) => d.sunAngleDeg < 3);
  return (
    <section style={{ marginTop: 48 }}>
      <div className="chart-head"><h2>Earth–Mars delay, 2026–2029</h2></div>
      <p className="small muted" style={{ marginTop: 8 }}>One-way light time in minutes. Red band: the Sun is within 3° of Mars (radio blackout). Source: {HORIZONS_SOURCE}.</p>
      <div style={{ height: 240, marginTop: 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={C.hair} vertical={false} />
            {black.length > 0 && <ReferenceArea x1={black[0].date} x2={black.at(-1)!.date} fill="#FC3D21" fillOpacity={0.25} />}
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(0, 7)} tick={{ fontSize: 11, fill: C.ink3 }} stroke={C.ink} minTickGap={40} />
            <YAxis domain={[0, 22]} tick={{ fontSize: 12, fill: C.ink3 }} stroke={C.ink} width={40} />
            <Tooltip contentStyle={{ background: C.page, border: `2px solid ${C.ink}`, borderRadius: 0, color: C.ink }} formatter={(v) => [`${Number(v).toFixed(1)} min`, "one way"]} labelFormatter={(l) => fmtDate(String(l))} />
            <Area dataKey="oneWayMin" stroke="none" fill="#6FA3FF" fillOpacity={0.2} isAnimationActive={false} />
            <Line dataKey="oneWayMin" stroke={C.personal} strokeWidth={2} dot={false} isAnimationActive={false} />
            <ReferenceLine x={data.reduce((a, d) => (Math.abs(Date.parse(d.date) - Date.parse(today)) < Math.abs(Date.parse(a) - Date.parse(today)) ? d.date : a), data[0].date)}
              stroke={C.ink} strokeDasharray="4 4" label={{ value: "today", position: "top", fontSize: 11, fill: C.ink }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
