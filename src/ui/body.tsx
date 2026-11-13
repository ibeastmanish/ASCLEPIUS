import { cloneElement, useEffect, useRef, type ReactElement } from "react";
import { guidance, HAZARDS, MEASURE } from "../content/guidance";
import { RULES, fmt, rank, worst } from "../engine/rules";
import type { CheckResult, Escalation, Indicator, IndicatorResult, PatternResult, Region, Status, Why } from "../engine/types";
import { Disclaimer, G, STATUS_GLYPH, StatusBadge } from "./ui";

// ------------------------------------------------------------------ regions
export const REGIONS: { id: Region; name: string; indicators: Indicator[] }[] = [
  { id: "brain", name: "Brain", indicators: ["sleep", "mood"] },
  { id: "heart", name: "Heart", indicators: ["hr", "bp_sys", "bp_dia", "crt"] },
  { id: "blood", name: "Blood", indicators: ["glucose"] },
  { id: "skin", name: "Skin", indicators: ["temp"] },
];
const REGION_HAZARD: Record<Region, keyof typeof HAZARDS> = { brain: "isolation", heart: "gravity", blood: "closed", skin: "closed" };

export function regionParts(c: CheckResult | null | undefined, region: Region) {
  const def = REGIONS.find((r) => r.id === region)!;
  const results = (c?.results ?? []).filter((r) => def.indicators.includes(r.indicator));
  const patterns = (c?.patterns ?? []).filter((p) => p.regions.includes(region));
  return { results, patterns };
}

export function regionStatus(c: CheckResult | null | undefined, region: Region): Status | "none" {
  const { results, patterns } = regionParts(c, region);
  if (!results.length && !patterns.length) return "none";
  let s: Status = "invalid";
  for (const r of results) s = worst(s, r.status);
  for (const p of patterns) s = worst(s, p.status);
  return s;
}

const FILL: Record<Status | "none", string> = { green: "#2EC27E", yellow: "#FFC72C", red: "#FC3D21", invalid: "#8a92a3", none: "#8a92a3" };
const ON: Record<Status | "none", string> = { green: "#03200F", yellow: "#2A1E00", red: "#000000", invalid: "#ffffff", none: "#ffffff" };
const WORD: Record<Status | "none", string> = { green: "Good", yellow: "Check", red: "Act now", invalid: "Re-measure", none: "Not checked" };

function glyphAt(s: Status | "none", x: number, y: number, size: number) {
  return cloneElement(STATUS_GLYPH[s] as ReactElement<Record<string, unknown>>, { x: x + size * 0.2, y: y + size * 0.2, width: size * 0.6, height: size * 0.6, color: ON[s] });
}

// ------------------------------------------------------------------ body map: a technical drawing
export function BodyMap({ check, onSelect, ripple }: {
  check: CheckResult | null | undefined;
  onSelect: (r: Region) => void;
  ripple?: { x: number; y: number; key: number } | null;
}) {
  const st = Object.fromEntries(REGIONS.map((r) => [r.id, regionStatus(check, r.id)])) as Record<Region, Status | "none">;
  const pulse = (s: Status | "none") => (s === "yellow" ? "glow-yellow" : s === "red" ? "glow-red" : "");
  const a11y = (r: Region) => ({
    role: "button", tabIndex: 0, "aria-label": `${REGIONS.find((x) => x.id === r)!.name}: ${WORD[st[r]]}. Open card.`,
    onClick: () => onSelect(r),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r); } },
  });
  const label = (r: Region, x: number, y: number, anchor: "start" | "end", lx: number, ly: number) => {
    const s = st[r];
    const sqX = anchor === "start" ? x : x - 18;
    const textX = anchor === "start" ? x + 24 : x - 24;
    return (
      <g className="region" {...a11y(r)}>
        <rect x={anchor === "start" ? x - 4 : x - 110} y={y - 24} width={114} height={52} fill="transparent" />
        <polyline points={`${anchor === "start" ? x + 96 : x - 96},${y - 18} ${anchor === "start" ? x + 104 : x - 104},${y - 18} ${lx},${ly}`} fill="none" stroke="currentColor" strokeWidth="1.25" />
        <circle cx={lx} cy={ly} r="3" fill="currentColor" />
        <text x={anchor === "start" ? x : x} y={y - 12} textAnchor={anchor} fontSize="11" fontWeight="700" letterSpacing="2" fill="currentColor">{r.toUpperCase()}</text>
        <rect x={sqX} y={y - 4} width="18" height="18" fill={FILL[s]} />
        {glyphAt(s, sqX, y - 4, 18)}
        <text x={textX} y={y + 10} textAnchor={anchor} fontSize="15" fontWeight="700" fill="currentColor">{WORD[s]}</text>
      </g>
    );
  };

  const skinOn = st.skin !== "none";
  return (
    <svg className="bodymap" viewBox="0 0 460 470" role="group" aria-label="Body map. Tap a region to see its card.">
      <defs>
        <linearGradient id="bm-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={FILL[st.skin]} stopOpacity={skinOn ? 0.34 : 0.1} />
          <stop offset="1" stopColor={FILL[st.skin]} stopOpacity={skinOn ? 0.1 : 0.03} />
        </linearGradient>
        <radialGradient id="bm-heart" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor={FILL[st.heart]} />
          <stop offset="1" stopColor={FILL[st.heart]} />
        </radialGradient>
        <radialGradient id="bm-brain" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor={FILL[st.brain]} />
          <stop offset="1" stopColor={FILL[st.brain]} />
        </radialGradient>
        <radialGradient id="bm-drop" cx="0.35" cy="0.55" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor={FILL[st.blood]} />
          <stop offset="1" stopColor={FILL[st.blood]} />
        </radialGradient>
      </defs>

      {/* instrument frame: scan reticle behind the figure */}
      <g className="bm-reticle" aria-hidden="true" transform="translate(60 0)">
        <circle cx="150" cy="236" r="206" />
        <circle cx="150" cy="236" r="150" strokeDasharray="2 6" />
        <path d="M150 22 v14 M150 436 v14 M-56 236 h14 M342 236 h14" />
        <line className="bm-scan" x1="40" x2="260" y1="0" y2="0" />
      </g>

      <g transform="translate(60 0)">
      <g className={`region ${pulse(st.skin)}`} {...a11y("skin")}>
        <g className="region-shape" fill="url(#bm-skin)" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
          <circle cx="150" cy="56" r="33" />
          <path d={SILHOUETTE} />
        </g>
      </g>
      <g className={`region ${pulse(st.blood)}`} {...a11y("blood")}>
        <g className="region-shape bm-vessels" fill="none" stroke={FILL[st.blood]} strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.9">
          <path d="M164 150 C 158 120, 154 104, 146 88 M164 150 C 166 120, 160 104, 156 88" />
          <path d="M160 160 C 154 200, 150 230, 150 258 C 146 300, 132 360, 126 420" />
          <path d="M150 258 C 154 300, 168 360, 174 420" />
          <path d="M158 140 C 136 132, 112 128, 100 150 C 92 190, 86 230, 80 270" />
          <path d="M170 140 C 190 132, 196 132, 200 150 C 208 190, 214 230, 220 270" />
        </g>
        <circle cx="76" cy="314" r="26" fill="transparent" />
        <path className="region-shape bm-drop" d="M76 292 C 76 292, 62 310, 62 319 a 14 14 0 0 0 28 0 C 90 310, 76 292, 76 292 Z" fill="url(#bm-drop)" stroke="currentColor" strokeWidth="1.8" />
      </g>
      <g className={`region ${pulse(st.heart)}`} {...a11y("heart")}>
        <g className="region-shape bm-heart">
          <path d="M166 176 C 140 160, 134 142, 146 132 C 154 126, 164 130, 166 138 C 168 130, 178 126, 186 132 C 198 142, 192 160, 166 176 Z"
            fill="url(#bm-heart)" stroke="currentColor" strokeWidth="1.8" />
          <path d="M158 132 C 158 124, 162 120, 168 120 M174 131 C 176 124, 180 122, 184 124" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </g>
      <g className={`region ${pulse(st.brain)}`} {...a11y("brain")}>
        <g className="region-shape">
          <path d="M150 34 C 136 32, 124 40, 124 52 C 120 58, 124 68, 132 70 C 136 76, 146 76, 150 72 C 154 76, 164 76, 168 70 C 176 68, 180 58, 176 52 C 176 40, 164 32, 150 34 Z"
            fill="url(#bm-brain)" stroke="currentColor" strokeWidth="1.8" />
          <path d="M150 36 V 72 M134 46 c 6 2 8 6 4 10 c -4 4 0 8 6 8 M166 46 c -6 2 -8 6 -4 10 c 4 4 0 8 -6 8 M128 58 c 4 -2 8 0 10 4 M172 58 c -4 -2 -8 0 -10 4"
            fill="none" stroke={ON[st.brain]} strokeOpacity="0.75" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </g>
      </g>
      {label("brain", 6, 40, "start", 186, 52)}
      {label("heart", 454, 112, "end", 248, 148)}
      {label("blood", 6, 300, "start", 124, 314)}
      {label("skin", 454, 330, "end", 252, 340)}
      {ripple && <circle key={ripple.key} className="ripple" cx={ripple.x + 60} cy={ripple.y} r="4" fill="none" stroke="currentColor" strokeWidth="3" />}
    </svg>
  );
}

// A front-view human silhouette (neck to feet), drawn as the left half and mirrored.
type Seg = [number, number, number, number, number, number];
const LEFT_START: [number, number] = [150, 86];
const LEFT: Seg[] = [
  [141, 86, 140, 96, 134, 102],   // neck
  [120, 108, 104, 110, 95, 120],  // shoulder slope
  [86, 130, 84, 142, 82, 158],    // shoulder cap
  [78, 192, 73, 224, 70, 252],    // outer arm
  [68, 264, 64, 276, 68, 284],    // hand, outer edge
  [72, 292, 82, 290, 84, 280],    // fingertips
  [86, 268, 87, 260, 89, 250],    // inner wrist
  [94, 222, 99, 192, 104, 168],   // inner arm up to the armpit
  [107, 192, 108, 214, 105, 236], // waist
  [103, 252, 102, 264, 106, 282], // hip
  [108, 332, 110, 382, 112, 414], // outer leg
  [112, 424, 108, 430, 112, 434], // ankle
  [120, 440, 134, 440, 138, 431], // foot
  [140, 400, 142, 330, 146, 280], // inner leg
  [147, 268, 148, 264, 150, 262], // to the centre line
];
const mx = (x: number) => 300 - x;
const SILHOUETTE = (() => {
  let d = `M${LEFT_START[0]} ${LEFT_START[1]}`;
  for (const [a, b, c, e, x, y] of LEFT) d += ` C${a} ${b} ${c} ${e} ${x} ${y}`;
  // walk the right half back up: reverse each segment and mirror it
  const pts: [number, number][] = [LEFT_START, ...LEFT.map((s) => [s[4], s[5]] as [number, number])];
  for (let i = LEFT.length - 1; i >= 0; i--) {
    const [a, b, c, e] = LEFT[i];
    const [px, py] = pts[i];
    d += ` C${mx(c)} ${e} ${mx(a)} ${b} ${mx(px)} ${py}`;
  }
  return d + " Z";
})();

// ------------------------------------------------------------------ ladder
const RUNGS: { e: Escalation; s: Status; title: string; text: string }[] = [
  { e: "none", s: "green", title: "All good", text: "Streak +1. No message is sent." },
  { e: "recheck", s: "yellow", title: "Do the steps, recheck tonight", text: "A recheck reminder is set." },
  { e: "tell-cmo", s: "yellow", title: "Tell the crew medical officer", text: "Yellow again at the recheck, a trend over several days, a pattern the CMO should know, or you feel unwell." },
  { e: "alert-cmo-and-earth", s: "red", title: "Act now", text: "CMO alerted at once. A signed summary goes to Earth." },
];

export function Ladder({ escalation }: { escalation: Escalation }) {
  return (
    <div className="ladder" aria-label="Escalation ladder">
      {[...RUNGS].reverse().map((r) => (
        <div key={r.e} className={`rung${r.e === escalation ? " here" : ""}`} aria-current={r.e === escalation ? "step" : undefined}>
          <span className="dot" style={{ background: FILL[r.s], color: ON[r.s] }} aria-hidden="true">{STATUS_GLYPH[r.s]}</span>
          <span><b>{r.title}</b><br /><span className="small">{r.text}</span></span>
          {r.e === escalation ? <span className="you">You are here</span> : <span />}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ signature: the measured band scale
function niceStep(range: number) {
  for (const s of [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50]) if (range / s <= 7) return s;
  return 100;
}

export function BandScale({ r }: { r: IndicatorResult }) {
  const c = RULES.indicators[r.indicator];
  const g = c.clinical.green;
  const glo = g.gte ?? g.gt ?? c.valid.gte!;
  const ghi = g.lte ?? g.lt ?? c.valid.lte!;
  const lo = Math.min(glo, r.band?.low ?? glo, r.value);
  const hi = Math.max(ghi, r.band?.high ?? ghi, r.value);
  const pad = (hi - lo) * 0.12 || 1;
  const a = lo - pad;
  const b = hi + pad;
  const x = (v: number) => ((v - a) / (b - a)) * 100;
  const step = niceStep(b - a);
  const ticks: number[] = [];
  for (let t = Math.ceil(a / step) * step; t <= b; t += step) ticks.push(Number(t.toFixed(2)));
  const vx = x(r.value);
  return (
    <div className="scale" role="img" aria-label={`${c.short}: today ${fmt(r.indicator, r.value)} ${c.unit}. Usual adult range ${glo} to ${ghi}.${r.band ? ` Your normal ${fmt(r.indicator, r.band.low)} to ${fmt(r.indicator, r.band.high)}.` : ""}`}>
      <div className="scale-track">
        <div className="scale-usual anim" style={{ left: `${x(glo)}%`, width: `${x(ghi) - x(glo)}%` }} />
        {r.band && <div className="scale-pers anim" style={{ left: `${x(r.band.low)}%`, width: `${x(r.band.high) - x(r.band.low)}%`, animationDelay: "0.15s" }} />}
        <div className="scale-axis" />
        {ticks.map((t) => <div key={t} className="scale-tick" style={{ left: `${x(t)}%` }} />)}
        <div className={`scale-val${vx > 70 ? " flip" : ""}`} style={{ left: `${vx}%` }}><span>Today {fmt(r.indicator, r.value)}</span></div>
      </div>
      <div className="scale-nums" aria-hidden="true">{ticks.map((t) => <span key={t} style={{ left: `${x(t)}%` }}>{t}</span>)}</div>
      <div className="scale-key">
        <span><i style={{ background: "repeating-linear-gradient(-45deg, #2EC27E 0 2px, transparent 2px 6px)", boxShadow: "inset 0 0 0 1px #2EC27E" }} />Usual adult range</span>
        {r.band && <span><i style={{ background: "var(--personal)" }} />Your normal</span>}
        <span><i style={{ background: "var(--nasa-red)", width: 4 }} />Today</span>
      </div>
    </div>
  );
}

function WhyItem({ w, rulesVersion }: { w: Why; rulesVersion: string }) {
  return (
    <div className="why-item">
      <div className="row" style={{ gap: 8 }}>
        <span className="rule">{w.ruleId}</span>
        <span className="tag">{w.layer}</span>
        {w.value !== undefined && <span className="small muted">value {w.indicator ? fmt(w.indicator, w.value) : w.value}</span>}
        {w.low !== undefined && w.high !== undefined && <span className="small muted">band {w.low}-{w.high}</span>}
      </div>
      <div>{w.text}</div>
      <div className="src">Source: {w.source} · rules v{rulesVersion}</div>
    </div>
  );
}

function worstResult(results: IndicatorResult[]): IndicatorResult | undefined {
  return [...results].sort((a, b) => rank(b.status) - rank(a.status))[0];
}

// ------------------------------------------------------------------ region card (drawer)
export function RegionCard({ check, region, onClose, scrollToWhy }: {
  check: CheckResult; region: Region; onClose: () => void; scrollToWhy?: boolean;
}) {
  const def = REGIONS.find((r) => r.id === region)!;
  const { results, patterns } = regionParts(check, region);
  const status = regionStatus(check, region);
  const lead = patterns.find((p) => p.status !== "green");
  const wr = worstResult(results);
  const g = lead ? guidance(lead.guidanceId) : guidance(wr?.guidanceId, wr?.side);
  const hazard = HAZARDS[g?.hazard ?? REGION_HAZARD[region]];
  const whyRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => {
    if (scrollToWhy) whyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToWhy]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${def.name} card`}>
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <h2>{g?.title ?? def.name}</h2>
            <div className="row" style={{ gap: 10 }}><StatusBadge status={status} /><span className="tag">{def.name}</span></div>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close card">{G.close}</button>
        </div>
        <div className="drawer-body">
          {patterns.map((p) => <div key={p.id} style={{ marginTop: 20 }}><PatternBlock p={p} /></div>)}

          <section className="dsec">
            <h3>What</h3>
            {results.map((r) => (
              <div key={r.indicator} className="reading-line">
                <span>{RULES.indicators[r.indicator].label}</span>
                <span className="row" style={{ gap: 14 }}>
                  <b>{fmt(r.indicator, r.value)} <span className="small muted" style={{ fontWeight: 400 }}>{RULES.indicators[r.indicator].unit}</span></b>
                  <StatusBadge status={r.status} />
                </span>
              </div>
            ))}
            {g && <p style={{ marginTop: 12 }}>{g.what}</p>}
          </section>

          <section className="dsec">
            <h3>Why it matters in space</h3>
            <p><b>{hazard.name}</b> <span className="tag tag-blue" style={{ marginLeft: 6 }}>NASA HRP hazard</span></p>
            <p style={{ marginTop: 8 }}>{hazard.text}</p>
            {g && <p className="small muted" style={{ marginTop: 10 }}>{g.why_this_check}</p>}
          </section>

          {g && (
            <section className="dsec">
              <h3>Do this now</h3>
              <ol>{g.do_now.map((s) => <li key={s}>{s}</li>)}</ol>
              <div className="banner banner-yellow" style={{ margin: "16px 0 0" }}>
                <span className="bi" aria-hidden="true">{G.alert}</span>
                <span><b>When to tell the CMO:</b> {g.escalate_if}</span>
              </div>
            </section>
          )}

          <section className="dsec" ref={whyRef}>
            <h3>Why this colour?</h3>
            {results.map((r) => (
              <div key={r.indicator} className="why-ind">
                <div className="row" style={{ justifyContent: "space-between" }}><b style={{ fontSize: 18 }}>{RULES.indicators[r.indicator].short}</b><StatusBadge status={r.status} /></div>
                {r.status !== "invalid" && <BandScale r={r} />}
                {r.why.map((w, i) => <WhyItem key={i} w={w} rulesVersion={check.rulesVersion} />)}
              </div>
            ))}
          </section>

          <details className="dsec">
            <summary><b>How to measure</b></summary>
            <div className="stack" style={{ marginTop: 12 }}>
              {def.indicators.filter((i) => i !== "bp_dia").map((i) => <p key={i}><b>{RULES.indicators[i].short}:</b> {MEASURE[i]}</p>)}
            </div>
          </details>
          {g && <p className="small muted" style={{ marginTop: 16 }}>Guidance source: {g.source}</p>}
          <Disclaimer />
        </div>
      </aside>
    </>
  );
}

export function PatternBlock({ p }: { p: PatternResult }) {
  const g = guidance(p.guidanceId);
  return (
    <section className={`pattern-card${p.status === "red" ? " red" : ""}`}>
      <h2 style={{ marginTop: 0 }}>{g?.title ?? p.id}</h2>
      <div className="head">
        <span className="label">{p.id === "SY-R1" ? "Warning sign" : "Pattern"} · {p.id}</span>
        <StatusBadge status={p.status} />
      </div>
      <p style={{ marginTop: 10 }}>{g?.what}</p>
      <ul>{p.why.map((w, i) => <li key={i}>{w.text}</li>)}</ul>
    </section>
  );
}
