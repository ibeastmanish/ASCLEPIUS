// Crew reference: Pillar C, "the proof, computed by the product" (PRD 6.3).
// Every number on this screen comes from src/data/i4_proof.json, written by
// `npm run proof` from the raw NASA OSDR files (see data/derived/README.md).
import { lazy, Suspense, useEffect, useState } from "react";
import { useApp } from "../app/store";
import { PROOF, SHORT } from "../proof/proof";
import "../proof/proof.css";
import { Disclaimer, G, StatusBadge, TopBar } from "../ui/ui";

// Recharts stays out of the first-load bundle (this screen is imported eagerly).
const McvChart = lazy(() => import("../proof/McvChart"));

const P = PROOF;
const M = P.mcv;
const E = P.engine;
const fmt1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

export function Crew() {
  const app = useApp();
  const video = app.video === "proof";
  const [view, setView] = useState<"r1" | "time">("r1");
  const [reveal, setReveal] = useState(!video);
  const [allIi, setAllIi] = useState(false);
  useEffect(() => {
    if (!video) return;
    const t = setTimeout(() => setReveal(true), 900);
    return () => clearTimeout(t);
  }, [video]);

  const r = M.result;
  const pop = M.population;
  const iiRows = allIi ? P.ii.rows : P.ii.rows.filter((x) => x.ii < P.ii.cutoff);
  const iiMax = Math.max(1.5, ...iiRows.map((x) => x.ii));
  const glucose = P.excluded.find((x) => x.analyte === "glucose");

  return (
    <>
      <TopBar title="Crew reference">
        <span className="tag tag-blue">Real NASA data · OSD-569 · OSD-575</span>
      </TopBar>

      <p className="lede">
        Normal for everyone is not normal for you. The day after landing, all {r.n} Inspiration4 crew had a red blood cell size
        (MCV) <b>inside the population range</b>, and all {r.n} were <b>below their own lowest pre-flight value</b>.
      </p>
      <p className="muted" style={{ marginTop: 10, maxWidth: "62ch" }}>
        This fits a personal change after flight. It does not prove one. The limits are listed below the chart.
      </p>

      <div className="stats proof-stats">
        <div className="stat">
          <span className="label">Population range {pop.low}-{pop.high} fL</span>
          <span className="big-num">{r.insidePopulationAtR1} of {r.n}</span>
          <StatusBadge status="green" word="Inside: looks fine" />
        </div>
        <div className="stat">
          <span className="label">Own pre-flight range</span>
          <span className="big-num">{r.belowOwnMinAtR1} of {r.n}</span>
          <StatusBadge status="yellow" word="Below: changed" />
        </div>
        {E && (
          <div className="stat">
            <span className="label">App's own band code</span>
            <span className="big-num">{E.result.r1OutsideBand} of {E.result.n}</span>
            <span className="small">outside the band it builds from the same 3 draws (see note)</span>
          </div>
        )}
      </div>

      <section style={{ marginTop: 32 }}>
        <div className="chart-head">
          <h2>Red cell size (MCV) <span className="muted small" style={{ fontWeight: 400 }}>{M.unit}</span></h2>
          <div className="seg" aria-label="Chart view">
            <button aria-pressed={view === "r1"} onClick={() => setView("r1")}>Day after landing</button>
            <button aria-pressed={view === "time"} onClick={() => setView("time")}>All 7 draws</button>
          </div>
        </div>
        <div className="chart-key" style={{ marginTop: 10 }}>
          <span><i className="key-pop" />Population range {pop.low}-{pop.high} fL</span>
          <span><i className="key-own" />Own range: lowest to highest of 3 pre-flight draws</span>
          {view === "r1" && <span><i className="key-dot" />Pre-flight draw</span>}
          <span><i className="key-sq" />{view === "r1" ? "Day after landing (R+1)" : "After flight, below own range"}</span>
        </div>
        {view === "time" && (
          <p className="small muted" style={{ marginTop: 8 }}>The whole chart sits inside the {pop.low}-{pop.high} fL population range.</p>
        )}
        <Suspense fallback={<div className="mcv-loading"><span className="spinner" aria-label="Loading chart" /></div>}>
          <McvChart view={view} crew={M.crew} pop={pop} reveal={reveal} />
        </Suspense>
        <p className={`proof-caption${reveal ? " shown" : ""}`} aria-live="polite">{M.caption}</p>

        <div className="table-wrap">
          <table className="ruled proof-table">
            <thead><tr><th>Crew</th><th>Own pre-flight</th><th>R+1</th><th>Result</th></tr></thead>
            <tbody>
              {M.crew.map((c) => (
                <tr key={c.crew}>
                  <td><b>{c.crew}</b></td>
                  <td>{c.preMin}-{c.preMax}</td>
                  <td><b>{c.r1}</b></td>
                  <td>
                    <span className="proof-res">{c.r1BelowOwnMin ? `${fmt1(c.preMin - c.r1)} below own lowest` : "Inside own range"}</span>
                    <span className="small muted">{c.r1InsidePopulation ? `Inside ${pop.low}-${pop.high}` : `Outside ${pop.low}-${pop.high}`}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {E && (
        <section className="panel proof-engine" style={{ marginTop: 32 }}>
          <span className="label">Same engine, same answer</span>
          <p>
            The app's own band function (<span className="mono">computeBaseline</span>, {E.rule}) was run on each person's 3 pre-flight
            draws. The day-after-landing value falls outside that band for <b>{E.result.r1OutsideBand} of {E.result.n}</b>.
          </p>
          <p className="small muted" style={{ marginTop: 8 }}>
            Honest note: the app switches a personal band on only after {E.learningChecks} checks. With 3 draws the band is very narrow,
            and {E.result.preflightDrawsOutsideOwnBand} of {E.result.preflightDraws} pre-flight draws already fall outside their own band.
            That is why the headline uses the simpler rule above (below the person's lowest pre-flight value), and why the app waits.
          </p>
        </section>
      )}

      <h2 className="section-title">Why a population range misses this</h2>
      <section className="panel proof-ii">
        <p className="proof-ii-lede">
          <b>{P.ii.below} of {P.ii.n}</b> blood markers in these files have an index of individuality under {P.ii.cutoff}.
        </p>
        <p className="small" style={{ marginTop: 6, maxWidth: "70ch" }}>
          The index compares how much a marker varies inside one person with how much it varies between people. Under {P.ii.cutoff},
          each person stays in a narrow lane of their own inside a wide population range, so a real change for that person can still
          look "normal".
        </p>
        <div className="ii-head small muted" aria-hidden="true">
          <span>Marker</span><span>Index (marker at {P.ii.cutoff})</span><span>Value</span>
        </div>
        <ol className="ii-list">
          {iiRows.map((x) => {
            const under = x.ii < P.ii.cutoff;
            return (
              <li key={x.analyte} className={`ii-row${under ? " under" : ""}`}>
                <span className="ii-name">{x.label}{x.analyte === "glucose" ? " *" : ""}</span>
                <span className="ii-track" aria-hidden="true">
                  <span className="ii-bar" style={{ width: `${(Math.min(x.ii, iiMax) / iiMax) * 100}%` }} />
                  <span className="ii-cut" style={{ left: `${(P.ii.cutoff / iiMax) * 100}%` }} />
                </span>
                <span className="ii-val"><b>{x.ii.toFixed(2)}</b> <span className="small muted">{under ? "under" : "over"}</span></span>
              </li>
            );
          })}
        </ol>
        <button className="btn btn-ghost" style={{ marginTop: 8 }} aria-expanded={allIi} onClick={() => setAllIi((v) => !v)}>
          {allIi ? `Show only the ${P.ii.below} under ${P.ii.cutoff}` : `Show all ${P.ii.n} markers`}
        </button>
        <p className="small muted" style={{ marginTop: 10, maxWidth: "75ch" }}>
          How: {P.ii.method} {P.ii.cutoffNote} A stricter variance-component version gives {P.ii.sensitivity.below} of {P.ii.sensitivity.n}.
          {allIi && glucose && " * Glucose is in this table only because the index uses pre-flight draws; it is excluded from the headline."}
          {" "}Not included: {P.ii.skipped.map((s) => s.label).join(", ")} (blank values or calculated from another marker).
        </p>
      </section>

      <div className="banner banner-yellow proof-limits" style={{ marginTop: 32 }}>
        <span className="bi" aria-hidden="true">{G.alert}</span>
        <div>
          <b>What this does not show</b>
          <ul>
            {P.limits.map((l) => <li key={l.id}>{l.text}</li>)}
          </ul>
          {glucose && (
            <p className="small" style={{ marginTop: 8 }}>
              Glucose at R+45: {glucose.r45.filter((g) => glucose.lowAtR45.includes(g.crew)).map((g) => `${g.crew} ${g.glucose} mg/dL (potassium ${g.potassium})`).join(", ")}.
            </p>
          )}
        </div>
      </div>

      <section className="panel proof-fix" style={{ marginTop: 32 }}>
        <span className="label">We found and fixed an error in the NASA file</span>
        <p>
          In the OSD-569 blood count file, the row for <b>crew member C003, 92 days before launch</b> is shifted. MCH is blank and the
          next ten values each sit one column late. The giveaway: the "lymphocyte" count there is 6826, which is exactly the
          neutrophil count (71.1% of 9,600 white cells).
        </p>
        <p style={{ marginTop: 8 }}>
          Our pipeline finds the row with arithmetic checks that every other row passes (each cell count = its % × white cells;
          MCH, MCHC and MCV from hemoglobin, hematocrit and red cells). It moves each value back and checks the row again. The
          original NASA file is kept unchanged, with the corrected copy next to it.
        </p>
        <div className="table-wrap">
          <table className="ruled proof-table">
            <thead><tr><th>Column</th><th>NASA file</th><th>Corrected</th></tr></thead>
            <tbody>
              {P.fix.moves.map((m) => (
                <tr key={m.column}>
                  <td>{SHORT[m.column] ?? m.column}</td>
                  <td>{m.raw ?? "blank"}</td>
                  <td><b>{m.corrected}</b>{m.takenFrom.startsWith("reconstructed") ? " (rebuilt from % × white cells)" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          MCV is not part of the shift, so the headline above does not depend on this fix. Details: <span className="mono">data/derived/README.md</span>.
        </p>
      </section>

      <p className="small muted" style={{ marginTop: 28 }}>
        Sources: {P.sources.map((s, i) => (
          <span key={s.id}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer">NASA OSDR {s.id}</a> ({s.panel === "CBC" ? "complete blood count" : "metabolic panel"})</span>
        ))}. Computed by <span className="mono">analysis/i4_proof.py</span> and <span className="mono">scripts/proof.mjs</span>.
        Reproduce: <span className="mono">npm run proof</span>.
      </p>
      <Disclaimer />
    </>
  );
}
