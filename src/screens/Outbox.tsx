import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel, fmtDate, utcHM } from "../app/clock";
import { useApp, videoOnce } from "../app/store";
import { HORIZONS_SOURCE, oneWayMin, series } from "../engine/horizons";
import { ASHA_TODAY } from "../seed/asha";
import { fingerprint, fromB64, toB64 } from "../storage/crypto";
import { open as openFromCrew } from "../storage/earthlink";
import type { OutboxMessage } from "../storage/events";
import { outboxView } from "../storage/projection";
import { G, StatusBadge, TopBar, chartColors, fmtMinutes, useDark } from "../ui/ui";
import { LinkTimeline } from "../ui/link";
import { EarthBanner } from "./Home";

export function Outbox() {
  const app = useApp();
  const { state, now, today } = app;
  const [stamp, setStamp] = useState(0);

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
        Every message is signed by your crew key and encrypted to the flight surgeon's key.
        Times below come from the light delay alone, the physics minimum; waiting for a relay orbiter or a free Deep Space Network dish can add more.
      </p>
      {queue.length > 0 && <p className="queue-order"><b>Send order:</b> {queue.map((m, k) => `${k + 1}. ${m.kind === "red-alert" ? "Red alert" : "Digest"}`).join(" · ")}</p>}
      {msgs.length === 0 && <div className="empty"><p>Nothing queued yet. Each day's first check adds a short digest; a red result adds an alert.</p></div>}
      <div className="msgs">
        {msgs.slice(0, 20).map((m) => <MessageRow key={m.id} m={m} stamp={stamp} />)}
      </div>
      <DelayChart />
    </>
  );
}

function MessageRow({ m, stamp }: { m: OutboxMessage; stamp: number }) {
  const { now, today, store, security } = useApp();
  const v = outboxView(m, now.getTime(), today);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; json?: unknown } | null>(null);
  const [webFp, setWebFp] = useState("");
  const isHermes = m.alg === "hermes";
  const fp = isHermes ? security?.crewFingerprint ?? "" : webFp;

  useEffect(() => {
    if (isHermes) return;
    store?.keyRing().then((r) => fingerprint(r.crewSign.publicJwk)).then(setWebFp);
  }, [store, isHermes]);

  async function verify(tamper: boolean) {
    if (!store) return;
    const ring = await store.keyRing();
    let payload = m.payload;
    if (tamper) {
      const b = fromB64(payload);
      b[b.length - 8] ^= 0x20; // flip one bit in the ciphertext
      payload = toB64(b);
    }
    try {
      const json = await openFromCrew(payload, ring);
      setResult({ ok: true, text: "Decrypted with the flight surgeon key. Signature valid: sent by this crew member, unchanged.", json });
    } catch (e) {
      setResult({ ok: false, text: `Rejected: ${tamper ? "one bit was changed in transit, so " : ""}the message failed its integrity check (${(e as Error).message || "decryption failed"}).` });
    }
  }

  return (
    <section className="msg-item">
      <div className="msg">
        <span className={`kind ${m.kind}`} aria-hidden="true">{m.kind === "red-alert" ? G.cross : G.digest}</span>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <span className="msg-title">{m.kind === "red-alert" ? "Red alert" : "Daily digest"}</span>
            <span className="small muted">{fmtDate(m.date)} · {dayLabel(Number(m.summary.day))} · {utcHM(m.createdAt)}</span>
          </div>
          <div className="tags">
            {v.state === "held" && <span className="tag tag-held"><span className="sw" />Held: Sun blackout until {fmtDate(m.heldUntil!)}</span>}
            {v.state === "in-transit" && <span className="tag tag-blue"><span className="sw" />In transit · arrives in {fmtMinutes(v.minutesLeft!)}</span>}
            {v.state === "delivered" && <span className="tag tag-ok"><span className="sw" />Delivered {fmtDate(v.eta!.slice(0, 10))} · {utcHM(v.eta!)}</span>}
            <span key={`s${stamp}`} className={`tag ${m.signed ? "tag-ok" : "tag-warn"} stamp`}>{m.signed ? "Signed" : "Unsigned"}</span>
            <span key={`e${stamp}`} className={`tag ${m.encrypted ? "tag-ok" : "tag-warn"} stamp`} style={{ animationDelay: "0.25s" }}>{m.encrypted ? "Encrypted" : "Plain"}</span>
            <span className="tag">{m.bytes} bytes · {isHermes ? "OpenPGP (Hermes)" : "CBOR + gzip"}</span>
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
              : <>ECDSA P-256 signature, ECDH P-256 + AES-GCM 256 encryption (WebCrypto, web build).</>}{" "}
            Crew key fingerprint <span className="mono">{fp}</span>.
            The flight surgeon key here is a <b>simulated ground station</b> so the demo can show decryption.
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => void verify(false)}>Decrypt and verify as Earth</button>
            <button className="btn" onClick={() => void verify(true)}>Tamper test: flip one bit</button>
          </div>
          {result && (
            <div className={`banner ${result.ok ? "banner-ok" : "banner-cmo"}`} style={{ margin: 0 }} role="status">
              <span className="bi" aria-hidden="true">{result.ok ? G.check : G.cross}</span><span>{result.text}</span>
            </div>
          )}
          {result?.json !== undefined && <pre className="json">{JSON.stringify(result.json, null, 2)}</pre>}
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
