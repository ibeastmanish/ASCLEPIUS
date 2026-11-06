import { useEffect, useMemo, useRef, useState } from "react";
import { dayLabel, fmtDate } from "../app/clock";
import { useApp } from "../app/store";
import { MEASURE } from "../content/guidance";
import * as engine from "../engine/client";
import { RULES, fmt } from "../engine/rules";
import type { ContextTag, Indicator, IndicatorResult, Symptom } from "../engine/types";
import { ASHA_TODAY } from "../seed/asha";
import { dueIndicators, historyBefore, latestValues } from "../storage/projection";
import { EarthBanner } from "./Home";
import { Disclaimer, Face, G, StatusBadge, TopBar } from "../ui/ui";
import { CrtCapture } from "../ui/CrtCapture";

type Tile = "bp" | "hr" | "glucose" | "temp" | "sleep" | "mood";
const TILES: Tile[] = ["bp", "hr", "glucose", "temp", "sleep", "mood"];
const TILE_INDS: Record<Tile, Indicator[]> = { bp: ["bp_sys", "bp_dia"], hr: ["hr"], glucose: ["glucose"], temp: ["temp"], sleep: ["sleep"], mood: ["mood"] };
const TILE_NAME: Record<Tile, string> = { bp: "Blood pressure", hr: "Heart rate", glucose: "Blood sugar", temp: "Temperature", sleep: "Sleep", mood: "Mood" };
// crt (capillary refill) has no stepper default used in the UI; DEFAULTS still needs
// an entry because the engine's Indicator type covers it. See MEASURE.crt / rules.json.
const DEFAULTS: Record<Indicator, number> = { bp_sys: 118, bp_dia: 76, hr: 64, glucose: 90, temp: 36.7, sleep: 7.5, mood: 4, crt: 2.0 };
const MOOD_WORDS = ["Very low", "Low", "Okay", "Good", "Great"];

export function Check() {
  const app = useApp();
  const { state, today, day } = app;
  const profile = state.profile!;
  const isVideo = app.video === "check";

  const prefill = useMemo(() => ({ ...DEFAULTS, ...latestValues(state) }), [state]);
  const [values, setValues] = useState<Record<Indicator, number>>(prefill);
  const [text, setText] = useState<Partial<Record<Indicator, string>>>({});
  const [tags, setTags] = useState<ContextTag[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [added, setAdded] = useState<Tile[]>([]);
  const [results, setResults] = useState<Partial<Record<Indicator, IndicatorResult>>>({});
  const [howto, setHowto] = useState<Tile | "crt" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [popKey, setPopKey] = useState<Partial<Record<Indicator, number>>>({});
  const [crtShown, setCrtShown] = useState(false);
  const [crtCaptured, setCrtCaptured] = useState(false);
  const started = useRef(performance.now());
  const taps = useRef(0);

  const unwell = tags.includes("unwell");
  const { resting } = dueIndicators(state, today, unwell || isVideo);
  const restingTiles = TILES.filter((t) => TILE_INDS[t].every((i) => resting.includes(i)) && !added.includes(t));
  const tiles = TILES.filter((t) => !restingTiles.includes(t));
  // The optional camera perfusion check only joins the submitted/evaluated set once
  // the astronaut has actually captured a reading; the required six are unaffected.
  const included = tiles.flatMap((t) => TILE_INDS[t]).concat(crtCaptured ? (["crt"] as Indicator[]) : []);

  // Live evaluation in the engine worker: each change re-scores its tile.
  const history = useMemo(() => historyBefore(state, today), [state, today]);
  useEffect(() => {
    let live = true;
    Promise.all(included.map((i) => engine.evaluateReading(i, values[i], { tags, baselines: state.baselines, history, date: today })))
      .then((rs) => { if (live) setResults(Object.fromEntries(rs.map((r) => [r.indicator, r]))); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, tags, included.join(","), state.baselines, history, today]);

  const set = (i: Indicator, v: number, from: "tap" | "type" = "tap") => {
    if (from === "tap") taps.current++;
    const step = RULES.indicators[i].step;
    const clean = from === "tap" ? Math.round(v / step) * step : v;
    setValues((old) => ({ ...old, [i]: Number(clean.toFixed(RULES.indicators[i].decimals + 1)) }));
    setPopKey((k) => ({ ...k, [i]: (k[i] ?? 0) + 1 }));
  };

  const onCrtResult = (v: number | undefined) => {
    if (v === undefined) { setCrtCaptured(false); return; }
    set("crt", v, "type");
    setCrtCaptured(true);
  };

  // Video mode: type the six J3 values at 450 ms each, then finish.
  useEffect(() => {
    if (!isVideo) return;
    const order: Indicator[] = ["bp_sys", "bp_dia", "hr", "glucose", "temp", "sleep", "mood"];
    const timers = order.map((i, k) => setTimeout(() => {
      setValues((old) => ({ ...old, [i]: ASHA_TODAY[i]! }));
      setPopKey((p) => ({ ...p, [i]: (p[i] ?? 0) + 1 }));
    }, 700 + k * 450));
    timers.push(setTimeout(() => void finish(), 700 + order.length * 450 + 1400));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo]);

  const anyInvalid = included.some((i) => results[i]?.status === "invalid");

  async function finish() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const v: Partial<Record<Indicator, number>> = {};
      for (const i of included) v[i] = values[i];
      const r = await app.submit({ values: v, tags, symptoms, input: "tapped" });
      sessionStorage.setItem("hygiea-last-timing", JSON.stringify({ s: Math.round((performance.now() - started.current) / 1000), taps: taps.current, ms: engine.lastTiming.ms }));
      location.hash = "#/body";
      void r;
    } finally {
      setSubmitting(false);
    }
  }

  const toggle = <T,>(list: T[], x: T, setter: (v: T[]) => void) => { taps.current++; setter(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]); };

  return (
    <>
      <TopBar title="Daily check">
        <span>{dayLabel(day)} · {fmtDate(today)} · {profile.name}</span>
        <span>About one minute</span>
      </TopBar>
      <EarthBanner />

      <div className="tiles">
        {tiles.map((t) => (
          <section key={t} className={`tile st-${tileStatus(t, results)}`} aria-label={TILE_NAME[t]}>
            <div className="tile-head">
              <span className="label">{TILE_NAME[t]}</span>
              <span className="row" style={{ gap: 8 }}>
                <TileStatus t={t} results={results} popKey={TILE_INDS[t].map((i) => popKey[i] ?? 0).join("-")} />
                <button className="icon-btn" aria-label={`How to measure ${TILE_NAME[t]}`} aria-expanded={howto === t} onClick={() => setHowto(howto === t ? null : t)}>{G.info}</button>
              </span>
            </div>
            {howto === t && <p className="howto">{MEASURE[TILE_INDS[t][0]]}</p>}
            {t === "mood" ? (
              <div className="faces" role="radiogroup" aria-label="Mood, 1 to 5">
                {MOOD_WORDS.map((_, k) => (
                  <button key={k} className="face" role="radio" aria-checked={values.mood === k + 1} aria-pressed={values.mood === k + 1}
                    aria-label={`${k + 1}: ${MOOD_WORDS[k]}`} onClick={() => set("mood", k + 1)}>
                    <Face level={k + 1} /><small>{k + 1}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className={t === "bp" ? "bp-pair" : ""}>
                {TILE_INDS[t].map((i) => (
                  <div key={i}>
                    {t === "bp" && <div className="sub">{i === "bp_sys" ? "Systolic (top)" : "Diastolic (bottom)"}</div>}
                    <Stepper ind={i} value={values[i]} text={text[i]}
                      onText={(s) => setText((x) => ({ ...x, [i]: s }))}
                      onCommit={(v) => { setText((x) => ({ ...x, [i]: undefined })); set(i, v, "type"); }}
                      onStep={(d) => set(i, values[i] + d * RULES.indicators[i].step * (i === "sleep" ? 1 : 1))} />
                  </div>
                ))}
              </div>
            )}
            <TileMessage t={t} results={results} />
          </section>
        ))}
      </div>

      {restingTiles.length > 0 && (
        <div className="resting">
          <span className="label">Not due today</span>
          <span className="small muted">Steady and in your normal for 7 days: asked every 2-3 days to save crew time.</span>
          {restingTiles.map((t) => <button key={t} className="chip" onClick={() => setAdded([...added, t])}><span aria-hidden="true" style={{ width: 16, height: 16 }}>{G.plus}</span>Add {TILE_NAME[t]}</button>)}
        </div>
      )}

      {!crtShown ? (
        <div className="resting">
          <span className="label">Optional</span>
          <span className="small muted">A camera-based perfusion self-test. Not one of the six required readings; try it when you have a minute.</span>
          <button className="chip" onClick={() => setCrtShown(true)}><span aria-hidden="true" style={{ width: 16, height: 16 }}>{G.plus}</span>Add perfusion check (camera)</button>
        </div>
      ) : (
        <section className={`tile st-${results.crt?.status ?? "none"}`} aria-label="Perfusion check">
          <div className="tile-head">
            <span className="label">Perfusion check <span className="small muted">· optional, experimental</span></span>
            <span className="row" style={{ gap: 8 }}>
              {results.crt && <StatusBadge status={results.crt.status} />}
              <button className="icon-btn" aria-label="How to measure perfusion check" aria-expanded={howto === "crt"} onClick={() => setHowto(howto === "crt" ? null : "crt")}>{G.info}</button>
            </span>
          </div>
          {howto === "crt" && <p className="howto">{MEASURE.crt}</p>}
          <CrtCapture onResult={onCrtResult} />
          {results.crt && <p className="tile-msg">{(results.crt.why.find((w) => w.layer === "personal" || w.layer === "trend") ?? results.crt.why[0])?.text}</p>}
        </section>
      )}

      <h2 className="section-title">Anything to note?</h2>
      <div className="chips" role="group" aria-label="Context">
        {(Object.keys(RULES.context) as ContextTag[]).map((c) => (
          <button key={c} className="chip" aria-pressed={tags.includes(c)} onClick={() => toggle(tags, c, setTags)}>{RULES.context[c].label}</button>
        ))}
      </div>
      {tags.some((t) => RULES.context[t].skipPersonal.length) && (
        <p className="small muted" style={{ marginTop: 8 }}>Some personal-band rules are paused for this reading. Red flags are never paused.</p>
      )}

      <h2 className="section-title">Any of these right now?</h2>
      <div className="chips" role="group" aria-label="Warning signs">
        {(Object.keys(RULES.symptoms.list) as Symptom[]).map((s) => (
          <button key={s} className="chip sym" aria-pressed={symptoms.includes(s)} onClick={() => toggle(symptoms, s, setSymptoms)}>{RULES.symptoms.list[s]}</button>
        ))}
      </div>
      {symptoms.length > 0 && (
        <div className="banner banner-cmo" style={{ marginTop: 16 }} role="alert">
          <span className="bi" aria-hidden="true">{G.cross}</span>
          <span><b>Any warning sign is red.</b> Finishing the check alerts the crew medical officer now.</span>
        </div>
      )}

      <div className="sticky-foot">
        <button className={`btn btn-lg ${symptoms.length ? "btn-danger" : "btn-primary"}`} disabled={anyInvalid || submitting} onClick={() => void finish()}>
          {submitting ? "Saving…" : symptoms.length ? "Finish and alert the CMO" : "Finish check"}
        </button>
        {anyInvalid ? <span className="small" style={{ color: "var(--red-ink)", fontWeight: 700 }}>Fix the value marked "Re-measure" first.</span>
          : <span className="small muted">{tiles.length} indicators · {tags.length ? `${tags.length} note${tags.length > 1 ? "s" : ""}` : "no notes"} · nothing leaves this device</span>}
      </div>
      <Disclaimer />
    </>
  );
}

function tileStatus(t: Tile, results: Partial<Record<Indicator, IndicatorResult>>) {
  const rs = TILE_INDS[t].map((i) => results[i]).filter(Boolean) as IndicatorResult[];
  if (rs.some((r) => r.status === "invalid")) return "invalid";
  if (rs.some((r) => r.status === "red")) return "red";
  if (rs.some((r) => r.status === "yellow")) return "yellow";
  return rs.length ? "green" : "none";
}

function TileStatus({ t, results, popKey }: { t: Tile; results: Partial<Record<Indicator, IndicatorResult>>; popKey: string }) {
  const s = tileStatus(t, results);
  if (s === "none") return null;
  return <span key={popKey}><StatusBadge status={s} pop /></span>;
}

function TileMessage({ t, results }: { t: Tile; results: Partial<Record<Indicator, IndicatorResult>> }) {
  const rs = TILE_INDS[t].map((i) => results[i]).filter(Boolean) as IndicatorResult[];
  const bad = rs.find((r) => r.status === "invalid");
  if (bad) return <p className="tile-msg invalid" role="alert">{bad.why[0].text}</p>;
  const learning = rs.find((r) => r.learning);
  const flagged = rs.find((r) => r.status !== "green");
  if (flagged) {
    const w = flagged.why.find((x) => x.layer === "trend") ?? flagged.why.find((x) => x.layer === "personal" && flagged.band?.position !== "inside") ?? flagged.why.find((x) => x.layer === "redflag") ?? flagged.why[0];
    return <p className="tile-msg">{w.text}</p>;
  }
  if (learning?.learning) return <p className="tile-msg">Learning your normal: {learning.learning.n} of {learning.learning.need}</p>;
  const b = rs[0]?.band;
  return <p className="tile-msg">{b ? `Your normal: ${fmt(rs[0].indicator, b.low)}-${fmt(rs[0].indicator, b.high)}` : ""}</p>;
}

function Stepper({ ind, value, text, onText, onCommit, onStep }: {
  ind: Indicator; value: number; text?: string;
  onText: (s: string) => void; onCommit: (v: number) => void; onStep: (d: 1 | -1) => void;
}) {
  const r = RULES.indicators[ind];
  const shown = text ?? (Number.isFinite(value) ? value.toFixed(r.decimals === 0 && ind !== "sleep" ? 0 : Math.max(r.decimals, Number.isInteger(value) ? (ind === "sleep" ? 1 : 0) : 1)) : "");
  const commit = () => {
    if (text === undefined) return;
    const v = parseFloat(text.replace(",", "."));
    onCommit(Number.isFinite(v) ? v : NaN);
  };
  return (
    <>
      <div className="stepper">
        <button className="step-btn" aria-label={`Decrease ${r.short}`} onClick={() => onStep(-1)}>{G.minus}</button>
        <input className="value-input" inputMode="decimal" aria-label={`${r.label} in ${r.unit}`} value={shown}
          onChange={(e) => onText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          onFocus={(e) => e.target.select()} />
        <button className="step-btn" aria-label={`Increase ${r.short}`} onClick={() => onStep(1)}>{G.plus}</button>
      </div>
      <div className="unit">{r.unit}</div>
    </>
  );
}
