import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel, fmtDate } from "../app/clock";
import { useApp } from "../app/store";
import { guidance } from "../content/guidance";
import { addDays } from "../engine/evaluate";
import { RULES, fmt } from "../engine/rules";
import type { CheckResult, Indicator, Status } from "../engine/types";
import { INDICATORS } from "../engine/types";
import { Disclaimer, StatusBadge, TopBar, chartColors, useDark } from "../ui/ui";

const COLORS: Record<Status, string> = { green: "#2EC27E", yellow: "#FFC72C", red: "#FC3D21", invalid: "#8a92a3" };

interface Point { date: string; day: number; value?: number; status?: Status; band?: [number, number]; checkId?: string }

export function Trends() {
  const { state, today } = useApp();
  const dark = useDark();
  const C = chartColors(dark);
  const [ind, setInd] = useState<Indicator>("hr");
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [picked, setPicked] = useState<Point | null>(null);
  const r = RULES.indicators[ind];

  const latestByDate = useMemo(() => {
    const m = new Map<string, CheckResult>();
    for (const c of state.checks) if (c.results.some((x) => x.indicator === ind)) m.set(c.date, c);
    return m;
  }, [state.checks, ind]);

  const data: Point[] = useMemo(() => {
    const out: Point[] = [];
    for (let k = range - 1; k >= 0; k--) {
      const date = addDays(today, -k);
      const c = latestByDate.get(date);
      const res = c?.results.find((x) => x.indicator === ind && x.status !== "invalid");
      out.push({ date, day: c?.day ?? 0, value: res?.value, status: res?.status, checkId: c?.checkId, band: res?.band ? [res.band.low, res.band.high] : undefined });
    }
    return out;
  }, [latestByDate, range, today, ind]);

  const g = r.clinical.green;
  const gLo = g.gte ?? g.gt;
  const gHi = g.lte ?? g.lt;
  const vals = data.flatMap((d) => [d.value, ...(d.band ?? [])]).filter((x): x is number => x !== undefined);
  const lo = Math.min(...vals, gLo ?? Infinity);
  const hi = Math.max(...vals, gHi ?? -Infinity);
  const pad = (hi - lo) * 0.12 || 1;
  const domain: [number, number] = [Math.floor(lo - pad), Math.ceil(hi + pad)];
  const counts = data.reduce((a, d) => (d.status ? { ...a, [d.status]: (a[d.status] ?? 0) + 1 } : a), {} as Record<string, number>);
  const pickedCheck = picked?.checkId ? state.checks.find((c) => c.checkId === picked.checkId) : undefined;
  const pickedRes = pickedCheck?.results.find((x) => x.indicator === ind);
  const pickedG = guidance(pickedRes?.guidanceId, pickedRes?.side);
  const latest = [...data].reverse().find((d) => d.value !== undefined);

  return (
    <>
      <TopBar title="Trends"><span>Your normal moves with you. The usual adult range does not.</span></TopBar>
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Indicator">
          {INDICATORS.map((i) => (
            <button key={i} role="tab" aria-selected={ind === i} onClick={() => { setInd(i); setPicked(null); }}>{RULES.indicators[i].short}</button>
          ))}
        </div>
        <div className="seg" aria-label="Range">
          {[7, 30, 90].map((n) => (
            <button key={n} aria-pressed={range === n} onClick={() => setRange(n as 7 | 30 | 90)}>{n} days</button>
          ))}
        </div>
      </div>

      <section>
        <div className="chart-head">
          <h2>{r.label} <span className="muted small" style={{ fontWeight: 400 }}>{r.unit}</span></h2>
          <div className="row" style={{ gap: 16 }}>
            {(["green", "yellow", "red"] as Status[]).map((s) => counts[s] ? <StatusBadge key={s} status={s} word={`${counts[s]} ${s}`} /> : null)}
          </div>
        </div>
        <div className="chart-key" style={{ marginTop: 10 }}>
          <span><i style={{ background: C.personalFill, opacity: 0.45 }} />Your normal at the time</span>
          <span><i style={{ background: "repeating-linear-gradient(-45deg, #2EC27E 0 2px, transparent 2px 6px)", boxShadow: "inset 0 0 0 1px #2EC27E" }} />Usual adult range</span>
          {latest?.value !== undefined && <span>Latest <b>{fmt(ind, latest.value)} {r.unit}</b> · tap a day for its guidance</span>}
        </div>
        <div style={{ height: 340, marginTop: 14 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}
              onClick={(e) => { const i = e?.activeTooltipIndex; if (typeof i === "number" && data[i]?.value !== undefined) setPicked(data[i]); }}>
              <CartesianGrid stroke={C.hair} vertical={false} />
              {gLo !== undefined && gHi !== undefined && <ReferenceArea y1={gLo} y2={gHi} fill="#2EC27E" fillOpacity={dark ? 0.14 : 0.1} />}
              {gLo !== undefined && gHi === undefined && <ReferenceArea y1={gLo} y2={domain[1]} fill="#2EC27E" fillOpacity={dark ? 0.14 : 0.1} />}
              {gLo === undefined && gHi !== undefined && <ReferenceArea y1={domain[0]} y2={gHi} fill="#2EC27E" fillOpacity={dark ? 0.14 : 0.1} />}
              <Area dataKey="band" type="stepAfter" stroke={C.personal} strokeOpacity={0.6} fill={C.personalFill} fillOpacity={dark ? 0.3 : 0.25} isAnimationActive={false} connectNulls activeDot={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 12, fill: C.ink3 }} stroke={C.ink} minTickGap={24} />
              <YAxis domain={domain} tick={{ fontSize: 12, fill: C.ink3 }} stroke={C.ink} allowDecimals={r.decimals > 0} width={48} />
              <Tooltip cursor={{ stroke: C.ink, strokeWidth: 1 }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Point;
                if (p.value === undefined) return null;
                return (
                  <div className="tip">
                    <b>{fmtDate(p.date)}</b> · {dayLabel(p.day)}<br />
                    {fmt(ind, p.value)} {r.unit} {p.status && <StatusBadge status={p.status} />}
                    {p.band && <><br />Your normal {fmt(ind, p.band[0])}-{fmt(ind, p.band[1])}</>}
                  </div>
                );
              }} />
              <Line dataKey="value" stroke={C.line} strokeWidth={2} connectNulls isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) => {
                  const p = props.payload;
                  if (!p?.status || props.cx === undefined || props.cy === undefined) return <g key={props.index} />;
                  const big = p.status !== "green";
                  const s = big ? 11 : range > 30 ? 5 : 7;
                  return <rect key={props.index} x={props.cx - s / 2} y={props.cy - s / 2} width={s} height={s} fill={COLORS[p.status]} stroke={C.page} strokeWidth={big ? 2 : 1} />;
                }}
                activeDot={{ r: 6, fill: C.ink, stroke: C.page }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {picked && pickedCheck && pickedRes && (
        <section className="picked">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b style={{ fontSize: 18 }}>{fmtDate(picked.date)} · {dayLabel(pickedCheck.day)}</b>
            <StatusBadge status={pickedRes.status} />
          </div>
          <p style={{ marginTop: 8 }}>{fmt(ind, pickedRes.value)} {r.unit}. {pickedRes.why.map((w) => w.text).join(" ")}</p>
          {pickedRes.status !== "green" && pickedG && (
            <><p style={{ marginTop: 10 }}><b>{pickedG.title}</b></p><ol>{pickedG.do_now.map((s) => <li key={s}>{s}</li>)}</ol></>
          )}
        </section>
      )}
      <Disclaimer />
    </>
  );
}
