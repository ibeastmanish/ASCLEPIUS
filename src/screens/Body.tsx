import { useEffect, useState } from "react";
import { dayLabel, fmtDate, utcHM } from "../app/clock";
import { useApp, videoOnce } from "../app/store";
import { guidance } from "../content/guidance";
import { RULES } from "../engine/rules";
import type { CheckResult, Region } from "../engine/types";
import { ASHA_TODAY } from "../seed/asha";
import { checksOn } from "../storage/projection";
import { BodyMap, Ladder, PatternBlock, REGIONS, RegionCard, regionParts, regionStatus } from "../ui/body";
import { Disclaimer, G, OVERALL_WORD, StatusBadge, TopBar, fmtMinutes } from "../ui/ui";
import { LinkTimeline } from "../ui/link";
import { EarthBanner } from "./Home";

export function Body() {
  const app = useApp();
  const { state, today } = app;
  const check: CheckResult | undefined = checksOn(state, today).at(-1) ?? state.checks.at(-1);
  const [open, setOpen] = useState<Region | null>(null);
  const [scrollWhy, setScrollWhy] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => sessionStorage.getItem("hygiea-dismissed-alert"));
  const [timing, setTiming] = useState<{ s: number; taps: number; ms: number } | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem("hygiea-last-timing");
    if (t) {
      setTiming(JSON.parse(t));
      sessionStorage.removeItem("hygiea-last-timing");
      const h = setTimeout(() => setTiming(null), 6000);
      return () => clearTimeout(h);
    }
  }, []);

  // Video mode "alert": a dangerously low blood sugar check, so the full-screen "Act now" alert shows.
  useEffect(() => {
    if (app.video !== "alert") return;
    if (!checksOn(state, today).length && videoOnce("alert")) void app.submit({ values: { ...ASHA_TODAY, glucose: 48 }, tags: [], symptoms: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.video]);

  // Video mode: pulse, tap ripple at 1.2 s, drawer at 1.5 s, "Why this colour?" at 3.0 s.
  useEffect(() => {
    if (app.video !== "bodymap") return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      if (!checksOn(state, today).length && videoOnce("bodymap")) await app.submit({ values: ASHA_TODAY, tags: [], symptoms: [] });
      timers = [
        setTimeout(() => setRipple({ x: 150, y: 55, key: 1 }), 1200),
        setTimeout(() => setOpen("brain"), 1500),
        setTimeout(() => setScrollWhy(true), 3000),
      ];
    })();
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.video]);

  if (!check) {
    return (
      <>
        <TopBar title="Body map" />
        <div className="empty">
          <p>No check yet. Do your daily check to colour the body map.</p>
          <a className="btn btn-primary btn-lg" href="#/check">Start check</a>
        </div>
      </>
    );
  }

  const isToday = check.date === today;
  const showAlert = check.overall === "red" && dismissed !== check.checkId && isToday;
  const topPatterns = check.patterns.filter((p) => p.status !== "green");
  const select = (r: Region) => { setScrollWhy(false); setOpen(r); };

  return (
    <>
      <TopBar title="Body map">
        <span>{isToday ? "Today" : fmtDate(check.date)} · {dayLabel(check.day)} · checked {utcHM(check.ts)}</span>
      </TopBar>
      <EarthBanner />

      <div className="answer-row">
        <StatusBadge status={check.overall} word={OVERALL_WORD[check.overall]} large />
        <p>{check.overall === "green" ? "Everything is inside the usual range and inside your normal." : "Tap a coloured region, or a row, to see what to do and why."}</p>
      </div>

      <div className="result-grid">
        <figure className="figure" style={{ margin: 0 }}>
          <BodyMap check={check} onSelect={select} ripple={ripple} />
          <figcaption className="figure-cap"><span>Fig. {check.day} · rules v{check.rulesVersion}</span><span>Worst result wins</span></figcaption>
        </figure>
        <div>
          {topPatterns.map((p) => <PatternBlock key={p.id} p={p} />)}
          <div className="region-list">
            {REGIONS.map((r) => {
              const s = regionStatus(check, r.id);
              const { results } = regionParts(check, r.id);
              const w = results.find((x) => x.status === s) ?? results[0];
              const g = guidance(w?.guidanceId, w?.side);
              return (
                <button key={r.id} className="region-row" onClick={() => select(r.id)}>
                  <StatusBadge status={s} word="" />
                  <span>
                    <span className="name">{r.name}</span><br />
                    <span className="sub">{results.length ? results.map((x) => `${RULES.indicators[x.indicator].short} ${x.value}${RULES.indicators[x.indicator].unit === "/5" ? "/5" : ` ${RULES.indicators[x.indicator].unit}`}`).join(" · ") : "Not measured"}</span>
                    {s !== "green" && g && <><br /><span className="sub" style={{ color: "var(--ink)" }}>{g.title}</span></>}
                  </span>
                  <span className="chev" aria-hidden="true">{G.chev}</span>
                </button>
              );
            })}
          </div>
          <section className="next">
            <span className="label">What happens next</span>
            <Ladder escalation={check.escalation} />
            <ul>{check.escalationWhy.map((w) => <li key={w}>{w}</li>)}</ul>
          </section>
        </div>
      </div>
      <Disclaimer />

      {open && <RegionCard check={check} region={open} scrollToWhy={scrollWhy} onClose={() => { setOpen(null); setScrollWhy(false); }} />}
      {showAlert && <RedAlert check={check} onClose={() => { sessionStorage.setItem("hygiea-dismissed-alert", check.checkId); setDismissed(check.checkId); }} />}
      {timing && !app.video && !showAlert && (
        <div className="toast" role="status"><span className="sq" aria-hidden="true" />Check done in {timing.s} s · {timing.taps} {timing.taps === 1 ? "tap" : "taps"} · engine {timing.ms.toFixed(1)} ms</div>
      )}
    </>
  );
}

function RedAlert({ check, onClose }: { check: CheckResult; onClose: () => void }) {
  const { state } = useApp();
  const sym = check.patterns.find((p) => p.id === "SY-R1");
  const red = check.results.find((r) => r.status === "red");
  const g = sym ? guidance(sym.guidanceId) : guidance(red?.guidanceId, red?.side);
  const msg = state.outbox.find((m) => m.checkId === check.checkId && m.kind === "red-alert");
  const mins = check.earthEta ? (Date.parse(check.earthEta) - Date.parse(check.ts)) / 60_000 : 0;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="alert-full" role="alertdialog" aria-modal="true" aria-labelledby="act-now">
      <div className="alert-band" />
      <div className="alert-inner">
        <div className="alert-sq" aria-hidden="true">{G.cross}</div>
        <span className="alert-kind">Red · {sym ? "warning sign" : red ? RULES.indicators[red.indicator].label : "result"}</span>
        <h1 id="act-now">Act now</h1>
        <p className="what">{g?.what}</p>
        <ol>{(g?.do_now ?? ["Call the crew medical officer now."]).map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="panels">
          <div className="panel"><b>Crew medical officer alerted</b> at {utcHM(check.ts)}.</div>
          <div className="panel">
            {check.earthHeld
              ? <><b>Earth summary held: Sun blackout.</b> It is sent automatically when the Sun moves out of the way. The CMO has it now.</>
              : <><b>Summary queued for Earth</b>{msg?.signed ? ", signed and encrypted" : ""}. It arrives in {fmtMinutes(mins)}; a reply takes {fmtMinutes(2 * mins)} or more. Don't wait for Earth: act first.
                  {mins > 0 && <LinkTimeline sentMs={Date.parse(check.ts)} oneWayMin={mins} />}</>}
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-primary btn-lg" onClick={onClose} autoFocus>I'm with the CMO: show details</button>
          <a className="btn btn-lg" href="#/outbox" onClick={onClose}>See Earth outbox</a>
        </div>
        <p className="foot">Decision support, not a medical device.</p>
      </div>
    </div>
  );
}
