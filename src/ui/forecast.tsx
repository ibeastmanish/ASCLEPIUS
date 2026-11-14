// Autonomy Forecast view: three rows (emergency, 4-hour problem, routine), one
// column per day Nov 2026 - Dec 2029, coloured by who decides. Colour is never
// the only signal: the legend names each level and the summary states the numbers.
import { useMemo } from "react";
import { fmtDate } from "../app/clock";
import { forecast, kinds, summarize, type ForecastKind } from "../engine/forecast";
import type { Autonomy } from "../engine/replyclock";

const FILL: Record<Autonomy, string> = { "earth-guided": "#2EC27E", "earth-consulted": "#FFC72C", "crew-decides": "#FC3D21" };
const WORD: Record<Autonomy, string> = { "earth-guided": "Earth guides", "earth-consulted": "Act, Earth confirms", "crew-decides": "Crew decides" };
const ROWS: ForecastKind[] = ["red", "fever", "routine"];

export function AutonomyForecast({ today, lonE }: { today: string; lonE?: number }) {
  const days = useMemo(() => forecast(lonE), [lonE]);
  const s = useMemo(() => summarize(days), [days]);
  const defs = kinds();
  const ti = days.findIndex((d) => d.date === today);
  const n = days.length;
  const pct = (i: number) => `${(i / n) * 100}%`;
  const years = days.map((d, i) => ({ d, i })).filter(({ d }) => d.date.endsWith("-01-01"));
  const fever = s.counts.fever;

  return (
    <section className="af" aria-label="Autonomy Forecast">
      <div className="chart-head"><h2>Autonomy Forecast</h2><span className="small muted">Who decides, for every day of the mission, at the crew&apos;s 07:00 Mars-time check</span></div>
      <p className="af-lede">
        The Earth Reply Clock, run for all {n.toLocaleString()} days from {fmtDate(days[0].date)} to {fmtDate(days[n - 1].date)}.
        It shows ahead of time when the crew will be on its own, so they can prepare before it happens.
      </p>

      <div className="af-chart">
        {ROWS.map((k) => (
          <div className="af-row" key={k}>
            <span className="af-label">{defs.find((x) => x.kind === k)!.label}</span>
            <div className="af-track">
              <svg viewBox={`0 0 ${n} 10`} preserveAspectRatio="none" role="img"
                aria-label={`${defs.find((x) => x.kind === k)!.label}: Earth guides on ${s.counts[k]["earth-guided"]} days, act and Earth confirms on ${s.counts[k]["earth-consulted"]}, crew decides on ${s.counts[k]["crew-decides"]}.`}>
                {days.map((d, i) => <rect key={i} x={i} y={0} width={1.02} height={10} fill={FILL[d.level[k]]} />)}
              </svg>
              {ti >= 0 && <span className="af-today" style={{ left: pct(ti) }} aria-hidden="true" />}
            </div>
          </div>
        ))}
        <div className="af-axis" aria-hidden="true">
          {years.map(({ d, i }) => <span key={d.date} style={{ left: pct(i) }}>{d.date.slice(0, 4)}</span>)}
          {s.blackout && <span className="af-bo" style={{ left: pct(days.findIndex((d) => d.blackout)) }}>Sun blackout</span>}
          {ti >= 0 && <span className="af-tl" style={{ left: pct(ti) }}>today</span>}
        </div>
      </div>

      <div className="af-legend">
        {(Object.keys(WORD) as Autonomy[]).map((l) => <span key={l}><i style={{ background: FILL[l] }} />{WORD[l]}</span>)}
      </div>

      <div className="af-facts">
        <div><b>{s.counts.red["crew-decides"].toLocaleString()} of {n.toLocaleString()} days</b><span>an emergency is always the crew&apos;s call on Mars: Earth can never answer within 10 minutes.</span></div>
        <div><b>{fever["earth-guided"]} days Earth guides · {fever["crew-decides"]} days crew decides</b><span>for a 4-hour problem. It flips back and forth because a Mars day is 39.6 min longer, so the morning check drifts in and out of Houston&apos;s shift (about every 37 sols).</span></div>
        {s.aloneRoutine && <div><b>{s.aloneRoutine.days} days fully alone</b><span>{fmtDate(s.aloneRoutine.start)} – {fmtDate(s.aloneRoutine.end)}: the Sun blocks the link, so even routine problems are the crew&apos;s call.</span></div>}
      </div>

      {s.blackout && (
        <div className="af-prep">
          <span className="label">Prepare from {fmtDate(s.blackout.prepareFrom)} (30 days before the blackout)</span>
          <ol>
            <li>Refresh the crew medical officer&apos;s training on the top emergency protocols.</li>
            <li>Check the medical kit: count every drug and supply needed for {s.blackout.days} days alone.</li>
            <li>Agree standing orders with the flight surgeon for the likeliest problems, so the crew already has Earth&apos;s answer.</li>
            <li>Send Earth a full health baseline for every crew member before the link closes.</li>
          </ol>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>Source: {s.source}. Shift hours and response times are labelled assumptions; light time and blackout are real.</p>
    </section>
  );
}
