import { useEffect, useState } from "react";
import { useApp } from "../app/store";
import summary from "../data/i4_summary.json";
import { G, TopBar } from "../ui/ui";

interface Point { timepoint: string; value: number; refLow: number | null; refHigh: number | null; insideClinical: boolean; pctVsBaseline: number; hiddenDrift: boolean; outsideAppBand: boolean }
interface Marker { study: string; marker: string; label: string; unit: string; crew: { crew: string; baseline: number; points: Point[] }[]; r1: { n: number; insideClinical: number; hiddenDrift: number; outsideAppBand: number } }
const S = summary as unknown as { title: string; method: string; caveat: string; driftPct: number; appBand: { learningChecks: number; preflightDraws: number; note: string }; sources: { id: string; url: string; what: string }[]; markers: Marker[] };

const TPS = ["R+1", "R+45", "R+82", "R+194"];

export function Crew() {
  const app = useApp();
  const [marker, setMarker] = useState("absolute_lymphocytes");
  const [tp, setTp] = useState("R+1");
  const [grown, setGrown] = useState(app.video !== "proof");
  useEffect(() => {
    if (app.video === "proof") { const t = setTimeout(() => setGrown(true), 600); return () => clearTimeout(t); }
  }, [app.video]);

  const m = S.markers.find((x) => x.marker === marker)!;
  const scale = 50; // ±50% fills the half track
  const rows = m.crew.map((c) => ({ crew: c.crew, baseline: c.baseline, p: c.points.find((x) => x.timepoint === tp) }));
  const nDrift = rows.filter((r) => r.p?.hiddenDrift).length;
  const nInside = rows.filter((r) => r.p?.insideClinical).length;

  return (
    <>
      <TopBar title="Crew reference">
        <span className="tag tag-blue">Real NASA data · {m.study}</span>
      </TopBar>
      <p className="lede">
        Normal for everyone is not normal for you. SpaceX Inspiration4 crew blood tests from NASA OSDR: each bar is one crew member's change
        from their own pre-flight level. On <b>{tp}</b>, <b>{nInside} of {rows.length}</b> were inside the lab's normal range for everyone,
        yet <b>{nDrift} of {rows.length}</b> had moved more than {S.driftPct}% from their own normal.
      </p>

      <div className="toolbar" style={{ marginTop: 28 }}>
        <div className="seg" aria-label="Marker">
          {S.markers.map((x) => <button key={x.marker} aria-pressed={marker === x.marker} onClick={() => setMarker(x.marker)}>{x.label}</button>)}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <span className="label">Days after landing</span>
          <div className="seg" aria-label="Days after landing">
            {TPS.map((t) => <button key={t} aria-pressed={tp === t} onClick={() => setTp(t)}>{t}</button>)}
          </div>
        </div>
      </div>

      <section className="i4">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b style={{ fontSize: 18 }}>{m.label} at {tp} vs. own pre-flight median ({m.unit})</b>
          <span className="small muted">Dashed red: ±{S.driftPct}% from own normal</span>
        </div>
        <div style={{ marginTop: 12 }}>
          {rows.map((r) => {
            const pct = r.p?.pctVsBaseline ?? 0;
            const w = Math.min(Math.abs(pct), scale) / scale * 50;
            return (
              <div key={r.crew} className="i4-row">
                <b>{r.crew}</b>
                <div className="i4-track" role="img" aria-label={`${r.crew}: ${pct > 0 ? "+" : ""}${pct}% vs own baseline; ${r.p?.insideClinical ? "inside" : "outside"} clinical range`}>
                  <div className="i4-thresh" style={{ left: `${50 - (S.driftPct / scale) * 50}%` }} />
                  <div className="i4-thresh" style={{ left: `${50 + (S.driftPct / scale) * 50}%` }} />
                  <div className={`i4-bar ${pct < 0 ? "down" : "up"}`} style={{ left: pct < 0 ? `${50 - (grown ? w : 0)}%` : "50%", width: `${grown ? w : 0}%` }} />
                  <div className="i4-zero" />
                </div>
                <span>
                  <span className="i4-pct">{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span><br />
                  {r.p?.insideClinical ? <span className="tag tag-ok"><span className="sw" />In lab range</span> : <span className="tag tag-bad"><span className="sw" />Out of range</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="table-wrap">
          <table className="ruled">
            <thead><tr><th>Crew</th><th>Own baseline</th><th>{tp} value</th><th>Lab range</th><th>Hidden drift</th><th>Outside app band*</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.crew}>
                  <td><b>{r.crew}</b></td><td>{r.baseline}</td><td>{r.p?.value}</td>
                  <td>{r.p?.refLow ?? "–"}–{r.p?.refHigh ?? "–"}</td><td>{r.p?.hiddenDrift ? "Yes" : "No"}</td><td>{r.p?.outsideAppBand ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 40 }}>
        <span className="label">Method</span>
        <p>{S.method}</p>
        <p style={{ marginTop: 10 }}>
          <b>* Why not the app's own band?</b> {S.appBand.note} With those {S.appBand.preflightDraws} draws it flags{" "}
          <b>{rows.filter((r) => r.p?.outsideAppBand).length} of {rows.length}</b> here. That is the reason HYGIEA waits for{" "}
          {S.appBand.learningChecks} daily checks before it switches a personal band on.
        </p>
        <div className="banner banner-yellow" style={{ margin: "16px 0 0" }}>
          <span className="bi" aria-hidden="true">{G.alert}</span><span><b>Caveat:</b> {S.caveat}</span>
        </div>
        <p className="small muted" style={{ marginTop: 14 }}>
          Sources: {S.sources.map((s, i) => <span key={s.id}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer">NASA OSDR {s.id}</a> ({s.what})</span>)}.
          {" "}Reproduce: <span className="mono">python3 analysis/inspiration4_baseline.py</span>
        </p>
      </section>
    </>
  );
}
