// MCV charts for the Crew screen. Loaded lazily (Recharts) by src/screens/Crew.tsx.
//  "r1":   one row per crew member: population band 80-100 fL (hatched green),
//          own pre-flight band (blue), the 3 pre-flight draws (circles) and R+1 (square + label).
//  "time": one small chart per crew member over all 7 draws, own band shaded;
//          draws below the own band are squares, with the value in the tooltip.
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { chartColors, useDark } from "../ui/ui";
import type { McvCrew } from "./proof";

const GREEN = "#2EC27E";
const YELLOW = "#FFC72C";

interface Props { view: "r1" | "time"; crew: McvCrew[]; pop: { low: number; high: number }; reveal: boolean }

export default function McvChart(p: Props) {
  return p.view === "r1" ? <Strip {...p} /> : <Timeline {...p} />;
}

interface Dot { x: number; y: number; crew: string; tp: string; kind: "pre" | "r1" }

function Strip({ crew, pop, reveal }: Props) {
  const C = chartColors(useDark());
  const pre: Dot[] = crew.flatMap((c, i) => c.series.filter((s) => s.day < 0).map((s) => ({ x: s.value, y: i + 1, crew: c.crew, tp: s.timepoint, kind: "pre" as const })));
  const r1: Dot[] = crew.map((c, i) => ({ x: c.r1, y: i + 1, crew: c.crew, tp: "R+1", kind: "r1" as const }));
  const ids = crew.map((c) => c.crew);
  const lo = pop.low - 4;
  const hi = pop.high + 4;
  return (
    <div className="mcv-chart" style={{ height: 300 }} role="img"
      aria-label={crew.map((c) => `${c.crew}: own pre-flight ${c.preMin} to ${c.preMax} fL, day after landing ${c.r1} fL, ${c.r1BelowOwnMin ? "below" : "not below"} own range, ${c.r1InsidePopulation ? "inside" : "outside"} the ${pop.low}-${pop.high} population range`).join(". ")}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 16, right: 10, bottom: 4, left: -8 }}>
          <defs>
            <pattern id="mcv-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <rect width="6" height="6" fill={GREEN} fillOpacity={0.06} />
              <line x1="0" y1="0" x2="0" y2="6" stroke={GREEN} strokeWidth="2" strokeOpacity={0.45} />
            </pattern>
          </defs>
          <CartesianGrid stroke={C.hair} horizontal={false} />
          <ReferenceArea x1={pop.low} x2={pop.high} y1={0.4} y2={ids.length + 0.6} fill="url(#mcv-hatch)" stroke={GREEN} strokeOpacity={0.9} ifOverflow="hidden" />
          {crew.map((c, i) => (
            <ReferenceArea key={c.crew} x1={c.preMin} x2={c.preMax} y1={i + 1 - 0.24} y2={i + 1 + 0.24} fill={C.personalFill} fillOpacity={0.45} stroke={C.personal} strokeWidth={1.5} />
          ))}
          {reveal && crew.map((c, i) => (
            <ReferenceLine key={c.crew} segment={[{ x: c.r1, y: i + 1 }, { x: c.preMin, y: i + 1 }]} stroke={C.ink} strokeDasharray="3 3" />
          ))}
          <XAxis type="number" dataKey="x" domain={[lo, hi]} ticks={[80, 85, 90, 95, 100]} allowDataOverflow tick={{ fontSize: 12, fill: C.ink3 }} stroke={C.ink}
            label={{ value: "fL", position: "insideBottomRight", offset: -2, fontSize: 12, fill: C.ink3 }} />
          <YAxis type="number" dataKey="y" domain={[0.4, ids.length + 0.6]} reversed ticks={ids.map((_, i) => i + 1)} tickFormatter={(v: number) => ids[v - 1] ?? ""}
            tick={{ fontSize: 13, fill: C.ink, fontWeight: 700 }} stroke={C.ink} width={52} />
          <Tooltip cursor={false} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Dot;
            const c = crew.find((x) => x.crew === d.crew)!;
            return (
              <div className="tip">
                <b>{d.crew}</b> · {d.tp === "R+1" ? "day after landing (R+1)" : `pre-flight ${d.tp}`}<br />
                MCV {d.x} fL<br />
                Own pre-flight {c.preMin}-{c.preMax} · population {pop.low}-{pop.high}
              </div>
            );
          }} />
          <Scatter data={pre} isAnimationActive={false}
            shape={(s: { cx?: number; cy?: number }) => <circle cx={s.cx} cy={s.cy} r={4} fill={C.personal} stroke={C.page} strokeWidth={1.5} />} />
          {reveal && (
            <Scatter data={r1} isAnimationActive={false}
              shape={(s: { cx?: number; cy?: number; payload?: Dot }) => {
                if (s.cx === undefined || s.cy === undefined) return <g />;
                return (
                  <g>
                    <rect x={s.cx - 7} y={s.cy - 7} width={14} height={14} fill={YELLOW} stroke={C.ink} strokeWidth={2} />
                    <text x={s.cx} y={s.cy - 13} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.ink}>R+1 {s.payload?.x}</text>
                  </g>
                );
              }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TP { tp: string; day: number; value?: number; below?: boolean }
const ORDER = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"];

function Timeline({ crew }: Props) {
  const C = chartColors(useDark());
  const all = crew.flatMap((c) => c.series.map((s) => s.value));
  const domain: [number, number] = [Math.floor(Math.min(...all) - 1.5), Math.ceil(Math.max(...all) + 1.5)];
  return (
    <div className="mcv-multiples">
      {crew.map((c) => {
        const data: TP[] = ORDER.map((t) => {
          const s = c.series.find((x) => x.timepoint === t);
          return { tp: t, day: s?.day ?? 0, value: s?.value, below: s ? s.day > 0 && s.value < c.preMin : undefined };
        });
        const missing = data.filter((d) => d.value === undefined).map((d) => d.tp);
        return (
          <figure key={c.crew} className="mcv-multiple">
            <figcaption><b>{c.crew}</b> <span className="muted small">own range {c.preMin}-{c.preMax} fL{missing.length ? ` · ${missing.join(", ")} blank in NASA file` : ""}</span></figcaption>
            <div style={{ height: 160 }} role="img"
              aria-label={`${c.crew} MCV over time: ${data.map((d) => `${d.tp} ${d.value ?? "no value"}${d.below ? " (below own range)" : ""}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={C.hair} vertical={false} />
                  <ReferenceArea y1={c.preMin} y2={c.preMax} fill={C.personalFill} fillOpacity={0.4} stroke={C.personal} strokeOpacity={0.7} />
                  <ReferenceLine x="R+1" stroke={C.ink3} strokeDasharray="2 3" />
                  <XAxis dataKey="tp" tick={{ fontSize: 10, fill: C.ink3 }} stroke={C.ink} interval={0} />
                  <YAxis domain={domain} tick={{ fontSize: 11, fill: C.ink3 }} stroke={C.ink} width={44} allowDecimals={false} />
                  <Tooltip cursor={{ stroke: C.ink, strokeWidth: 1 }} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as TP;
                    if (d.value === undefined) return <div className="tip"><b>{d.tp}</b> · blank in the NASA file</div>;
                    return <div className="tip"><b>{c.crew} · {d.tp}</b><br />MCV {d.value} fL{d.below ? " · below own pre-flight range" : ""}</div>;
                  }} />
                  <Line dataKey="value" stroke={C.line} strokeWidth={1.5} connectNulls isAnimationActive={false}
                    dot={(s: { cx?: number; cy?: number; payload?: TP; index?: number }) => {
                      const d = s.payload;
                      if (s.cx === undefined || s.cy === undefined || d?.value === undefined) return <g key={s.index} />;
                      if (d.below) return <rect key={s.index} x={s.cx - 5} y={s.cy - 5} width={10} height={10} fill={YELLOW} stroke={C.ink} strokeWidth={1.5} />;
                      return <circle key={s.index} cx={s.cx} cy={s.cy} r={3.5} fill={d.day < 0 ? C.personal : C.page} stroke={d.day < 0 ? C.page : C.ink} strokeWidth={1.5} />;
                    }}
                    activeDot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </figure>
        );
      })}
    </div>
  );
}
