// ASCLEPIUS Ground Station console (ground.html). A second static page: no server.
// Receives sealed crew packets over BroadcastChannel (or paste / file drop), holds
// each for the real light time, verifies it with the station's own private key,
// triages, shows the decision snapshot and signs the flight surgeon's reply.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { fmtDate, utcHM } from "../app/clock";
import { RULES } from "../engine/rules";
import type { Escalation, Indicator, Status } from "../engine/types";
import { bundleFromGround, fingerprint, groundFromBundle, newGroundKeys, type CrewKeyBundle } from "../storage/crypto";
import { G, Logo, SimTag, StatusBadge, fmtMinutes } from "../ui/ui";
import { DEMO_STATION } from "./demoKeys";
import {
  DSN_CHANNEL, fmtHold, isPacket, releaseAt, replyReleaseAt, triage, TRIAGE_LABEL,
  type DsnMessage, type DsnPacket, type DsnReply, type ReplyBody, type Triage,
} from "./protocol";
import { GroundDB, GROUND_RULES_VERSION, groundRulesHash, loadStation, makeReply, saveMeta, verifyPacket, type PacketRow, type StationState } from "./station";

const ESCALATION: Record<Escalation, string> = {
  none: "No escalation",
  recheck: "Re-check later today",
  "tell-cmo": "Tell the crew medical officer today",
  "alert-cmo-and-earth": "Alert the CMO now and send to Earth",
};

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function useFingerprint(jwk?: JsonWebKey) {
  const [fp, setFp] = useState("");
  useEffect(() => { if (jwk) void fingerprint(jwk).then(setFp); }, [jwk]);
  return fp;
}

async function copyText(text: string, filename: string): Promise<string> {
  try {
    await navigator.clipboard.writeText(text);
    return "Copied to the clipboard.";
  } catch {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = filename;
    a.click();
    return "Saved as a file.";
  }
}

export function Ground() {
  const db = useMemo(() => new GroundDB(), []);
  const [station, setStation] = useState<StationState | null>(null);
  const [rows, setRows] = useState<PacketRow[]>([]);
  const [replies, setReplies] = useState<DsnReply[]>([]);
  const [warp, setWarpState] = useState(1);
  const [crewHeard, setCrewHeard] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [tofu, setTofu] = useState<Record<string, boolean>>({});
  const chan = useRef<BroadcastChannel | null>(null);
  const busy = useRef(false);
  const now = useNow();

  const refresh = useCallback(async () => {
    setRows(await db.packets.toArray());
    setReplies(await db.replies.toArray());
  }, [db]);

  const reloadStation = useCallback(async () => {
    const s = await loadStation(db);
    setStation(s);
    setWarpState(((await db.meta.get("warp"))?.value as number) ?? 1);
    setTofu(((await db.meta.get("tofu"))?.value as Record<string, boolean>) ?? {});
  }, [db]);

  useEffect(() => { void reloadStation(); void refresh(); }, [reloadStation, refresh]);

  const post = (m: DsnMessage) => { try { chan.current?.postMessage(m); } catch { /* closed */ } };

  const receive = useCallback(async (p: DsnPacket): Promise<"new" | "duplicate"> => {
    const known = await db.packets.get(p.id);
    if (!known) await db.packets.put({ id: p.id, packet: p, heardAt: Date.now() });
    post({ t: "ack", ids: [p.id] });
    await refresh();
    return known ? "duplicate" : "new";
  }, [db, refresh]);

  // The link: packets in, sync / acks / replies out.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(DSN_CHANNEL);
    chan.current = c;
    c.onmessage = async (ev: MessageEvent<DsnMessage>) => {
      const m = ev.data;
      if (!m || typeof m !== "object") return;
      if (m.t === "packet" && isPacket(m.packet)) {
        setCrewHeard(Date.now());
        await receive(m.packet);
      } else if (m.t === "sync" && m.from === "crew") {
        setCrewHeard(Date.now());
        const ids = (await db.packets.toCollection().primaryKeys()) as string[];
        c.postMessage({ t: "ack", ids } satisfies DsnMessage);
        const have = new Set(m.have);
        for (const r of await db.replies.toArray()) if (!have.has(r.id)) c.postMessage({ t: "reply", reply: r } satisfies DsnMessage);
      }
    };
    void db.packets.toCollection().primaryKeys().then((ids) => c.postMessage({ t: "sync", from: "ground", have: ids as string[] } satisfies DsnMessage));
    return () => { c.close(); chan.current = null; };
  }, [db, receive]);

  // Release packets whose light time is up, then open and verify them.
  useEffect(() => {
    if (!station || busy.current) return;
    const due = rows.filter((r) => !r.verdict && releaseAt(r.packet, warp).releaseMs <= now)
      .sort((a, b) => releaseAt(a.packet, warp).releaseMs - releaseAt(b.packet, warp).releaseMs);
    if (!due.length) return;
    busy.current = true;
    (async () => {
      try {
        let crews = station.crews;
        const t = { ...tofu };
        for (const r of due) {
          if (!crews[r.packet.crew] && station.demo && r.packet.crewKey?.sign?.x) {
            // Demo keys only: trust the first crew key heard for this crew id (shown as such).
            crews = { ...crews, [r.packet.crew]: r.packet.crewKey };
            t[r.packet.crew] = true;
            await saveMeta(db, "crews", crews);
            await saveMeta(db, "tofu", t);
          }
          const all = await db.packets.toArray();
          const seen = new Set(all.flatMap((x) => (x.verdict?.status === "accepted" && x.verdict.replayKey ? [x.verdict.replayKey] : [])));
          const verdict = await verifyPacket(r.packet, station.keys, crews, seen);
          await db.packets.put({ ...r, verdict, arrivedAt: Date.now() });
        }
        if (crews !== station.crews) setStation({ ...station, crews });
        setTofu(t);
        await refresh();
      } finally {
        busy.current = false;
      }
    })();
  }, [rows, now, warp, station, db, refresh, tofu]);

  async function setWarp(w: number) {
    setWarpState(w);
    await saveMeta(db, "warp", w);
  }

  async function trustCrew(row: PacketRow) {
    if (!station) return;
    const crews = { ...station.crews, [row.packet.crew]: row.packet.crewKey };
    await saveMeta(db, "crews", crews);
    setStation({ ...station, crews });
    // Re-check every packet from this crew that was waiting for pairing.
    for (const r of await db.packets.toArray()) {
      if (r.packet.crew === row.packet.crew && r.verdict?.status === "unpaired") await db.packets.put({ ...r, verdict: undefined });
    }
    await refresh();
  }

  async function sendReply(row: PacketRow, text: string) {
    if (!station || !row.verdict || !row.arrivedAt) return;
    const rel = releaseAt(row.packet, warp);
    const reply = await makeReply(row.packet, row.verdict, text, station.surgeon, station.keys, { nowReal: Date.now(), arrivedReal: row.arrivedAt, warp, holdMs: rel.holdMs });
    await db.replies.put(reply);
    post({ t: "reply", reply });
    await refresh();
  }

  async function replayTest(row: PacketRow) {
    const n = rows.filter((r) => r.id.startsWith(`${row.id}~replay`)).length + 1;
    await receive({ ...row.packet, id: `${row.id}~replay${n}`, injected: true, sentAtReal: Date.now() });
    setNotice({ ok: true, text: `Replay test: an exact copy of sequence #${row.verdict?.seq ?? "?"} was injected at the ground antenna. See "Rejected" below.` });
  }

  async function wipe() {
    await db.packets.clear();
    await db.replies.clear();
    await refresh();
    setOpenId(null);
  }

  if (!station) return <div className="loading"><span className="spinner" aria-label="Loading" /></div>;

  const pending = rows.filter((r) => !r.verdict).sort((a, b) => releaseAt(a.packet, warp).releaseMs - releaseAt(b.packet, warp).releaseMs);
  const accepted = rows.filter((r) => r.verdict?.status === "accepted")
    .map((r) => ({ r, t: triage(r.verdict!.summary ?? {}) }))
    .sort((a, b) => a.t - b.t || (b.r.arrivedAt ?? 0) - (a.r.arrivedAt ?? 0));
  const problems = rows.filter((r) => r.verdict && r.verdict.status !== "accepted").sort((a, b) => (b.arrivedAt ?? 0) - (a.arrivedAt ?? 0));
  const linkUp = crewHeard > 0 && now - crewHeard < 5 * 60_000;

  return (
    <div className="shell gs">
      <header className="band">
        <a className="band-mark" href="#" aria-label="ASCLEPIUS Ground Station">
          <span className="sq" aria-hidden="true" />
          <b>ASCLEPIUS</b>
        </a>
        <span className="gs-sub">Ground Station</span>
        <div className="band-right">
          {warp > 1 && <span className="gs-warp" role="status"><span aria-hidden="true">{G.sun}</span>Time warp ×{warp}</span>}
          <SimTag />
        </div>
      </header>
      <main className="main">
        <header className="topbar">
          <span className="sec-num" aria-hidden="true"><Logo className="" /></span>
          <h1>Ground Station console</h1>
          <div className="topbar-meta"><span>Flight surgeon desk · simulated crew data · no server</span></div>
        </header>
        <p className="intro">
          Sealed crew messages arrive here after the real one-way light time for their mission date (NASA JPL Horizons), and are held through a Sun blackout.
          Each one is opened with this station&apos;s own private key, its crew signature checked, and its sequence number checked against replays.
        </p>

        {notice && (
          <div className={`banner ${notice.ok ? "banner-ok" : "banner-cmo"}`} role="status">
            <span className="bi" aria-hidden="true">{notice.ok ? G.check : G.cross}</span><span>{notice.text}</span>
          </div>
        )}

        <div className="gs-grid">
          <LinkCard linkUp={linkUp} warp={warp} setWarp={setWarp} />
          <StationCard station={station} onChange={async (msg) => { await reloadStation(); setNotice(msg); }} db={db} />
          <PasteCard onPacket={async (p) => {
            const r = await receive(p);
            setNotice({ ok: true, text: r === "new" ? `Packet ${p.id} received. It is now in transit.` : `Packet ${p.id} was already here.` });
          }} onError={(t) => setNotice({ ok: false, text: t })} />
        </div>

        <h2 className="gs-h2">In transit <span className="small">{pending.length ? `${pending.length} on the link` : "nothing on the link"}</span></h2>
        <div className="gs-list" aria-live="polite">
          {pending.length === 0 && <p className="small muted">Nothing in transit. Complete a daily check on the crew tablet (another tab, same browser), then open its Outbox once.</p>}
          {pending.map((r) => <TransitRow key={r.id} row={r} warp={warp} now={now} />)}
        </div>

        <h2 className="gs-h2">Triage queue <span className="small">red first, then persistent yellow / tell CMO, then digests</span></h2>
        <div className="gs-list">
          {accepted.length === 0 && <p className="small muted">No verified messages yet.</p>}
          {accepted.map(({ r, t }) => (
            <QueueRow key={r.id} row={r} t={t} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)}
              replies={replies.filter((x) => x.inReplyTo === r.id)} station={station} tofu={!!tofu[r.packet.crew]} now={now}
              onReply={(text) => sendReply(r, text)} onReplay={() => replayTest(r)} />
          ))}
        </div>

        {problems.length > 0 && (
          <>
            <h2 className="gs-h2">Rejected or waiting <span className="small">not added to the queue</span></h2>
            <div className="gs-list">
              {problems.map((r) => <ProblemRow key={r.id} row={r} onTrust={() => trustCrew(r)} />)}
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 40 }}>
          <a className="btn" href={`${import.meta.env.BASE_URL}#/outbox`} target="_blank" rel="noopener">Open the crew tablet</a>
          <button className="btn btn-ghost" onClick={() => void wipe()}>Clear console messages</button>
        </div>
        <p className="disclaimer" style={{ marginTop: 24 }}>
          <span aria-hidden="true">{G.info}</span>
          <span>Concept demo with simulated crew data. Decision support, not a medical device. Replies here are not medical advice.</span>
        </p>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ cards
function LinkCard({ linkUp, warp, setWarp }: { linkUp: boolean; warp: number; setWarp: (w: number) => void }) {
  return (
    <section className="gs-card" aria-label="Link">
      <span className="label">Deep Space link (demo)</span>
      <div className="gs-tags">
        <span className={`tag ${linkUp ? "tag-ok" : "tag-warn"}`}><span className="sw" />{linkUp ? "Crew tablet in contact" : "Waiting for the crew tablet"}</span>
        <span className="tag"><span className="sw" />Tab link: {typeof BroadcastChannel === "undefined" ? "unavailable" : "asclepius-dsn"}</span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="small" id="warp-label"><b>Time warp</b> (demo only): ×60 makes an 11-minute light time pass in 11 seconds.</span>
        <div className="seg" role="group" aria-labelledby="warp-label">
          <button aria-pressed={warp === 1} onClick={() => setWarp(1)}>×1 real time</button>
          <button aria-pressed={warp === 60} onClick={() => setWarp(60)}>×60 time warp</button>
        </div>
      </div>
    </section>
  );
}

function StationCard({ station, db, onChange }: { station: StationState; db: GroundDB; onChange: (n: { ok: boolean; text: string }) => void }) {
  const fp = useFingerprint(station.keys.bundle.enc);
  const [show, setShow] = useState(false);
  const [crewPaste, setCrewPaste] = useState("");
  const [surgeon, setSurgeon] = useState(station.surgeon);
  const pub = JSON.stringify(bundleFromGround(groundFromBundle(station.keys.bundle)), null, 1);

  async function newKeys() {
    const k = await newGroundKeys("Ground station");
    await saveMeta(db, "station", { bundle: k.bundle, encPrivateJwk: k.encPrivateJwk, signPrivateJwk: k.signPrivateJwk });
    onChange({ ok: true, text: "New station keys made and kept in this console only. Pair the crew tablet with the new public key (Outbox → Ground station link)." });
  }
  async function demoKeys() {
    await db.meta.delete("station");
    onChange({ ok: true, text: "Back to the demo station keys." });
  }
  async function addCrew() {
    try {
      const b = JSON.parse(crewPaste) as CrewKeyBundle;
      if (b?.asclepius !== "crew-key" || !b.sign?.x || !b.crew) throw new Error("That is not a crew public key.");
      if ((b.sign as { d?: string }).d) throw new Error("That block contains a private key. Paste only the public key.");
      const crews = { ...station.crews, [b.crew]: b };
      await saveMeta(db, "crews", crews);
      setCrewPaste("");
      onChange({ ok: true, text: `Crew ${b.crew} paired. Fingerprint ${await fingerprint(b.sign)}.` });
    } catch (e) {
      onChange({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <section className="gs-card" aria-label="Station keys">
      <span className="label">Station keys</span>
      <div className="gs-tags">
        <span className={`tag ${station.demo ? "tag-warn" : "tag-ok"}`}><span className="sw" />{station.demo ? "Demo keys" : "Own keys"}</span>
        <span className="tag mono">{fp}</span>
      </div>
      <p className="small muted">
        The private keys stay in this console&apos;s own storage (IndexedDB <span className="mono">asclepius-ground</span>), never on the crew tablet.
        {station.demo && <> The demo keys ship with the app so two tabs work out of the box; they are public and protect nothing.</>}
      </p>
      <div className="row">
        <button className="btn" aria-expanded={show} onClick={() => setShow(!show)}>{show ? "Hide public key" : "Show public key"}</button>
        {station.demo ? <button className="btn" onClick={() => void newKeys()}>New station keys</button> : <button className="btn" onClick={() => void demoKeys()}>Use demo keys</button>}
      </div>
      {show && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="field"><span>Public key for pairing (paste into the crew Outbox)</span>
            <textarea className="gs-ta" readOnly value={pub} onFocus={(e) => e.currentTarget.select()} /></label>
          <button className="btn" onClick={() => void copyText(pub, "ground-station-key.json").then((t) => onChange({ ok: true, text: t }))}>Copy public key</button>
        </div>
      )}
      <details>
        <summary>Paired crew keys ({Object.keys(station.crews).length})</summary>
        <div className="stack" style={{ marginTop: 8, gap: 8 }}>
          {Object.values(station.crews).map((c) => <CrewKeyLine key={c.crew} c={c} />)}
          <label className="field"><span>Pair a crew key (JSON from the crew Outbox)</span>
            <textarea className="gs-ta" value={crewPaste} onChange={(e) => setCrewPaste(e.target.value)} spellCheck={false} /></label>
          <button className="btn" disabled={!crewPaste.trim()} onClick={() => void addCrew()}>Pair crew key</button>
        </div>
      </details>
      <label className="field"><span>Flight surgeon signing replies</span>
        <input value={surgeon} onChange={(e) => setSurgeon(e.target.value)} onBlur={() => void saveMeta(db, "surgeon", surgeon)} /></label>
    </section>
  );
}

function CrewKeyLine({ c }: { c: CrewKeyBundle }) {
  const fp = useFingerprint(c.sign);
  return <span className="small">{c.name} ({c.crew}) · <span className="mono">{fp}</span></span>;
}

function PasteCard({ onPacket, onError }: { onPacket: (p: DsnPacket) => void; onError: (t: string) => void }) {
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  function take(raw: string) {
    try {
      const p = JSON.parse(raw);
      if (!isPacket(p)) throw new Error("not a packet");
      onPacket({ ...p, injected: undefined });
      setText("");
    } catch {
      onError("That is not an ASCLEPIUS packet. Use \"Copy packet for the console\" in the crew Outbox.");
    }
  }
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) take(await f.text());
    else take(e.dataTransfer.getData("text"));
  }
  return (
    <section className="gs-card" aria-label="Manual receive">
      <span className="label">No tab link? Paste or drop a packet</span>
      <div className={`gs-zone${drag ? " drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => void onDrop(e)}>
        <label className="field"><span>Sealed packet (JSON), or drop a .dsn.json file here</span>
          <textarea className="gs-ta" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} /></label>
        <div className="row">
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => take(text)}>Receive packet</button>
          <label className="btn">Choose file<input type="file" accept=".json,application/json" className="sr-only"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) take(await f.text()); e.target.value = ""; }} /></label>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ rows
function KindIcon({ kind }: { kind: DsnPacket["kind"] }) {
  return <span className={`kind ${kind}`} aria-hidden="true">{kind === "red-alert" ? G.cross : G.digest}</span>;
}
const kindWord = (k: DsnPacket["kind"]) => (k === "red-alert" ? "Red alert" : "Daily digest");

function TransitRow({ row, warp, now }: { row: PacketRow; warp: number; now: number }) {
  const p = row.packet;
  const rel = releaseAt(p, warp);
  const left = rel.releaseMs - now;
  const total = Math.max(1, rel.releaseMs - p.sentAtReal);
  const pct = Math.min(100, Math.max(0, ((now - p.sentAtReal) / total) * 100));
  return (
    <div className="gs-item">
      <KindIcon kind={p.kind} />
      <div style={{ minWidth: 0 }}>
        <div className="gs-title">{kindWord(p.kind)} · {p.name}</div>
        <div className="gs-meta">Sealed {fmtDate(p.missionDate)} {utcHM(p.sentAt)} · {p.bytes} bytes · contents sealed until arrival</div>
        <div className="gs-tags">
          {rel.heldForBlackout
            ? <span className="tag tag-held"><span className="sw" />Held: Sun blackout until {fmtDate(rel.blackoutEnd!)}</span>
            : <span className="tag tag-blue"><span className="sw" />Light time {fmtMinutes(rel.oneWayMin)}</span>}
          {warp > 1 && <span className="tag tag-warn"><span className="sw" />Time warp ×{warp}</span>}
          {p.simulated && <span className="tag tag-sim">Simulated crew data</span>}
        </div>
        <div className="gs-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="small muted">arrives in</div>
        <div className="gs-count" role="timer" aria-label={`Arrives in ${fmtHold(left)}`}>{fmtHold(left)}</div>
      </div>
    </div>
  );
}

function ProblemRow({ row, onTrust }: { row: PacketRow; onTrust: () => void }) {
  const p = row.packet;
  const v = row.verdict!;
  const hint = useFingerprint(p.crewKey?.sign);
  const replay = v.stage === "replay";
  return (
    <div className="gs-item">
      <span className="kind" style={{ background: v.status === "unpaired" ? "var(--yellow)" : "var(--red)", color: "#000" }} aria-hidden="true">
        {v.status === "unpaired" ? G.question : G.cross}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="gs-title">
          {v.status === "unpaired" ? "Waiting for pairing" : v.status === "unreadable" ? "Cannot open here" : replay ? "Rejected: replay" : v.stage === "signature" ? "Rejected: signature check failed" : "Rejected"}
          {" · "}{kindWord(p.kind)} · {p.name}
        </div>
        <div className="gs-meta">{v.reason}</div>
        <div className="gs-tags">
          {p.injected && <span className="tag tag-bad"><span className="sw" />Injected at the antenna</span>}
          {v.seq ? <span className="tag">Seq #{v.seq}</span> : null}
          {v.status === "unpaired" && hint && <span className="tag mono">Key {hint}</span>}
        </div>
      </div>
      {v.status === "unpaired" && <button className="btn" onClick={onTrust}>Trust this crew key</button>}
    </div>
  );
}

function QueueRow({ row, t, open, onToggle, replies, station, tofu, now, onReply, onReplay }: {
  row: PacketRow; t: Triage; open: boolean; onToggle: () => void; replies: DsnReply[]; station: StationState; tofu: boolean; now: number;
  onReply: (text: string) => Promise<void>; onReplay: () => void;
}) {
  const p = row.packet;
  const s = row.verdict!.summary ?? {};
  const overall = (s.overall as Status) ?? "none";
  return (
    <section className={`gs-item${open ? " open" : ""}`} aria-label={`${TRIAGE_LABEL[t]}: ${kindWord(p.kind)} from ${p.name}`}>
      <KindIcon kind={p.kind} />
      <div style={{ minWidth: 0 }}>
        <div className="gs-title">{kindWord(p.kind)} · {p.name}</div>
        <div className="gs-meta">{TRIAGE_LABEL[t]} · {fmtDate(p.missionDate)} {utcHM(p.sentAt)} · arrived {row.arrivedAt ? utcHM(row.arrivedAt) : ""}</div>
        <div className="gs-tags">
          <StatusBadge status={overall} />
          <span className="tag tag-ok"><span className="sw" />Signature valid</span>
          <span className="tag">Seq #{row.verdict!.seq || "none"}</span>
          {replies.length > 0 && <span className="tag tag-blue"><span className="sw" />Replied</span>}
          {!!s.simulated && <span className="tag tag-sim">Simulated crew data</span>}
        </div>
      </div>
      <button className="btn" aria-expanded={open} onClick={onToggle}>{open ? "Close" : "Open snapshot"}</button>
      {open && <Snapshot row={row} replies={replies} station={station} tofu={tofu} now={now} onReply={onReply} onReplay={onReplay} />}
    </section>
  );
}

// ------------------------------------------------------------------ decision snapshot
interface SnapResult { i: Indicator; v: number; s: Status; u?: string; band?: { low: number; high: number; position: string }; learning?: { n: number; need: number }; why?: { id: string; layer: string; text: string }[] }

function Check({ ok, children }: { ok: boolean | "warn"; children: ReactNode }) {
  return (
    <div>
      <span className={ok === true ? "ok" : "bad"} aria-hidden="true">{ok === true ? G.check : ok === "warn" ? G.alert : G.cross}</span>
      <span><b>{ok === true ? "Pass" : ok === "warn" ? "Note" : "Fail"}</b> · {children}</span>
    </div>
  );
}

function Snapshot({ row, replies, station, tofu, now, onReply, onReplay }: {
  row: PacketRow; replies: DsnReply[]; station: StationState; tofu: boolean; now: number; onReply: (text: string) => Promise<void>; onReplay: () => void;
}) {
  const v = row.verdict!;
  const s = (v.summary ?? {}) as Record<string, unknown>;
  const [rulesHash, setRulesHash] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState("");
  useEffect(() => { void groundRulesHash().then(setRulesHash); }, []);

  const results: SnapResult[] = Array.isArray(s.results)
    ? (s.results as SnapResult[])
    : Object.entries((s.readings as Record<string, [number, Status]>) ?? {}).map(([i, [val, st]]) => ({ i: i as Indicator, v: val, s: st }));
  const patterns = (Array.isArray(s.patternsSeen) ? s.patternsSeen : []) as { id: string; s: Status; tellCmo: boolean; why: string[] }[];
  const symptoms = (Array.isArray(s.symptoms) ? s.symptoms : []) as string[];
  const earth = s.earth as { oneWayMin: number; blackout: boolean; blackoutEnd?: string } | undefined;
  const crewHash = typeof s.rulesHash === "string" ? s.rulesHash : "";
  const sameVersion = s.rulesVersion === GROUND_RULES_VERSION;
  const sameHash = !!crewHash && crewHash === rulesHash;

  return (
    <div className="gs-snap">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ fontSize: 20 }}>Decision snapshot</h3>
        {!!s.simulated && <SimTag />}
      </div>
      <p className="small muted">Exactly what the crew tablet showed when it sealed this message, as signed by the crew key.</p>

      <div className="gs-verify" aria-label="Verification">
        <Check ok>Decrypted with this station&apos;s private key ({station.demo ? "demo keys" : "own keys"}).</Check>
        <Check ok>Crew signature valid for {String(s.name ?? row.packet.name)} · key <span className="mono">{v.crewFingerprint}</span>{tofu && " (trusted on first contact, demo)"}.</Check>
        <Check ok={v.seq ? true : "warn"}>{v.seq ? <>Sequence #{v.seq} not seen before (replay protection).</> : <>No sequence number (sealed before replay protection); checked by hash instead.</>}</Check>
        <Check ok={sameVersion && (sameHash || !crewHash) ? true : "warn"}>
          Rules {String(s.rulesVersion ?? "?")}{sameVersion ? " = ground copy" : ` ≠ ground copy ${GROUND_RULES_VERSION}`}
          {crewHash && <>; rule-set SHA-256 {sameHash ? "matches" : "differs"}</>}.
        </Check>
      </div>
      <div className="small">
        <div><b>Snapshot SHA-256</b> <span className="gs-hash">{v.bodyHash}</span></div>
        <div><b>Rule set SHA-256 (crew)</b> <span className="gs-hash">{crewHash || "not included (older message)"}</span></div>
        <div><b>Rule set SHA-256 (ground)</b> <span className="gs-hash">{rulesHash}</span></div>
      </div>

      <div className="row" style={{ alignItems: "center" }}>
        <StatusBadge status={(s.overall as Status) ?? "none"} large />
        <span><b>{ESCALATION[(s.escalation as Escalation) ?? "none"] ?? String(s.escalation)}</b></span>
      </div>
      {Array.isArray(s.escalationWhy) && s.escalationWhy.length > 0 && (
        <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{(s.escalationWhy as string[]).map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      {earth && (
        <p className="small muted">
          Earth link the crew saw: {earth.blackout ? <>Sun blackout until {earth.blackoutEnd ? fmtDate(earth.blackoutEnd) : "?"}</> : <>one-way light time {fmtMinutes(earth.oneWayMin)}</>} on {fmtDate(String(s.date))} (mission day {String(s.day)}).
        </p>
      )}

      <div className="gs-table-wrap">
        <table className="gs-table">
          <thead><tr><th>Reading</th><th>Value</th><th>Status</th><th>Personal band</th><th>Why this colour</th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.i}>
                <td><b>{RULES.indicators[r.i]?.label ?? r.i}</b></td>
                <td style={{ whiteSpace: "nowrap" }}>{r.v} {r.u ?? RULES.indicators[r.i]?.unit ?? ""}</td>
                <td><StatusBadge status={r.s} /></td>
                <td style={{ whiteSpace: "nowrap" }}>{r.band ? `${r.band.low}–${r.band.high} (${r.band.position})` : r.learning ? `learning ${r.learning.n}/${r.learning.need}` : "–"}</td>
                <td className="why">{r.why?.length ? r.why.map((w) => <div key={w.id + w.text}>{w.text} <span className="mono muted">{w.id}</span></div>) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {patterns.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Patterns</span>
          {patterns.map((p) => (
            <div key={p.id} className="small"><StatusBadge status={p.s} word={p.id} /> {p.tellCmo && <b>Tell CMO. </b>}{p.why.join(" ")}</div>
          ))}
        </div>
      )}
      {symptoms.length > 0 && <p className="small"><b>Symptoms reported:</b> {symptoms.join(", ").replace(/_/g, " ")}</p>}

      <div className="stack" style={{ gap: 8 }}>
        <span className="label">Flight surgeon reply</span>
        {replies.map((r) => <SentReply key={r.id} r={r} now={now} onCopy={() => void copyText(JSON.stringify(r), `${r.id}.json`).then(setCopied)} />)}
        {copied && <span className="small muted" role="status">{copied}</span>}
        <label className="field"><span>Advice to the crew (signed with the station key, arrives one light time later)</span>
          <textarea className="gs-ta" maxLength={600} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <div className="row">
          <button className="btn btn-primary" disabled={!text.trim() || sending} onClick={async () => { setSending(true); await onReply(text); setText(""); setSending(false); }}>
            <span aria-hidden="true">{G.send}</span>Sign and send reply
          </button>
          <button className="btn" onClick={onReplay}>Replay test: re-send this packet</button>
        </div>
      </div>
    </div>
  );
}

function SentReply({ r, now, onCopy }: { r: DsnReply; now: number; onCopy: () => void }) {
  const body = useMemo(() => {
    try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(r.signed.body), (c) => c.charCodeAt(0)))) as ReplyBody; } catch { return null; }
  }, [r]);
  if (!body) return null;
  const at = replyReleaseAt(r, body.oneWayMin);
  const left = at - now;
  return (
    <div className="banner banner-ok" style={{ margin: 0 }}>
      <span className="bi" aria-hidden="true">{left > 0 ? G.send : G.check}</span>
      <span className="stack" style={{ gap: 4 }}>
        <span>&ldquo;{body.text}&rdquo;</span>
        <span className="small muted">
          Signed by the station · {left > 0 ? <>reaches the crew in <b>{fmtHold(left)}</b></> : <>reached the crew</>} · light time back {fmtMinutes(body.oneWayMin)}
          {" "}· answer {fmtMinutes(body.answerAfterMin)} after the crew sent it{r.warp > 1 && <> · time warp ×{r.warp}</>}
        </span>
        <span><button className="btn btn-ghost" onClick={onCopy}>Copy reply for the crew tablet</button></span>
      </span>
    </div>
  );
}

export { DEMO_STATION };
