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
import { EN, t as tr, type Key, type Lang, type Vars } from "../i18n";

type Tile = "bp" | "hr" | "glucose" | "temp" | "sleep" | "mood";
const TILES: Tile[] = ["bp", "hr", "glucose", "temp", "sleep", "mood"];
const TILE_INDS: Record<Tile, Indicator[]> = { bp: ["bp_sys", "bp_dia"], hr: ["hr"], glucose: ["glucose"], temp: ["temp"], sleep: ["sleep"], mood: ["mood"] };
const TILE_KEY: Record<Tile, Key> = { bp: "tiles.bp", hr: "tiles.hr", glucose: "tiles.glucose", temp: "tiles.temp", sleep: "tiles.sleep", mood: "tiles.mood" };
// crt (capillary refill) has no stepper default used in the UI; DEFAULTS still needs
// an entry because the engine's Indicator type covers it. See MEASURE.crt / rules.json.
const DEFAULTS: Record<Indicator, number> = { bp_sys: 118, bp_dia: 76, hr: 64, glucose: 90, temp: 36.7, sleep: 7.5, mood: 4, crt: 2.0 };
const MOOD_KEYS: Key[] = ["mood_words.0", "mood_words.1", "mood_words.2", "mood_words.3", "mood_words.4"];
// Context and symptom chips: the translation table mirrors rules.json; a tag the table
// does not know yet falls back to the English label from the rules themselves.
const ctxLabel = (c: ContextTag, lang: Lang | undefined) => { const k = `context.${c}` as Key; return k in EN ? tr(k, lang) : RULES.context[c].label; };
const symLabel = (x: Symptom, lang: Lang | undefined) => { const k = `symptoms.${x}` as Key; return k in EN ? tr(k, lang) : RULES.symptoms.list[x]; };

export function Check() {
  const app = useApp();
  const { state, today, day } = app;
  const profile = state.profile!;
  const isVideo = app.video === "check";
  // Daily-check language (Settings > Earth use). Everything visible goes through tx(); numbers, units and rule IDs do not.
  const lang = state.settings.lang;
  const tx = (key: Key, vars?: Vars) => tr(key, lang, vars);
  const tileName = (x: Tile) => tx(TILE_KEY[x]);

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
  // Simulated crew (demo) always asks all six, so the README walkthrough and judges see every reading.
  const { resting } = dueIndicators(state, today, unwell || isVideo || !!profile.simulated);
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
    // Call the latest finish(): the one captured here would submit the pre-filled values.
    timers.push(setTimeout(() => void finishRef.current(), 700 + order.length * 450 + 1400));
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
      sessionStorage.setItem("asclepius-last-timing", JSON.stringify({ s: Math.round((performance.now() - started.current) / 1000), taps: taps.current, ms: engine.lastTiming.ms }));
      location.hash = "#/body";
      void r;
    } finally {
      setSubmitting(false);
    }
  }

  const finishRef = useRef(finish);
  finishRef.current = finish;

  const toggle = <T,>(list: T[], x: T, setter: (v: T[]) => void) => { taps.current++; setter(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]); };

  return (
    <>
      <TopBar title={tx("screen.title")}>
        <span>{dayLabel(day)} · {fmtDate(today)} · {profile.name}</span>
        <span>{tx("screen.about_one_minute")}</span>
      </TopBar>
      {(lang === "te" || lang === "hi") && (
        <p className="small muted" role="note" data-testid="draft-badge" style={{ margin: "0 0 12px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px" }}>
          <span className="tag tag-warn" style={{ whiteSpace: "normal" }}><span className="sw" />{tr("screen.draft_badge", lang)}</span>
          <span>{tr("screen.draft_badge", "en")}</span>
        </p>
      )}
      <EarthBanner />

      <div className="tiles">
        {tiles.map((t) => (
          <section key={t} className={`tile st-${tileStatus(t, results)}`} aria-label={tileName(t)}>
            <div className="tile-head">
              <span className="label">{tileName(t)}</span>
              <span className="row" style={{ gap: 8 }}>
                <TileStatus t={t} lang={lang} results={results} popKey={TILE_INDS[t].map((i) => popKey[i] ?? 0).join("-")} />
                <button className="icon-btn" aria-label={tx("screen.how_to_measure", { tile: tileName(t) })} aria-expanded={howto === t} onClick={() => setHowto(howto === t ? null : t)}>{G.info}</button>
              </span>
            </div>
            {howto === t && <p className="howto">{MEASURE[TILE_INDS[t][0]]}</p>}
            {t === "mood" ? (
              <div className="faces" role="radiogroup" aria-label={tx("tiles.mood_scale")}>
                {MOOD_KEYS.map((_, k) => (
                  <button key={k} className="face" role="radio" aria-checked={values.mood === k + 1} aria-pressed={values.mood === k + 1}
                    aria-label={`${k + 1}: ${tx(MOOD_KEYS[k])}`} onClick={() => set("mood", k + 1)}>
                    <Face level={k + 1} /><small>{k + 1}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className={t === "bp" ? "bp-pair" : ""}>
                {TILE_INDS[t].map((i) => (
                  <div key={i}>
                    {t === "bp" && <div className="sub">{tx(i === "bp_sys" ? "tiles.bp_sys" : "tiles.bp_dia")}</div>}
                    <Stepper ind={i} value={values[i]} text={text[i]}
                      onText={(s) => setText((x) => ({ ...x, [i]: s }))}
                      onCommit={(v) => { setText((x) => ({ ...x, [i]: undefined })); set(i, v, "type"); }}
                      onStep={(d) => set(i, values[i] + d * RULES.indicators[i].step * (i === "sleep" ? 1 : 1))} />
                  </div>
                ))}
              </div>
            )}
            <TileMessage t={t} lang={lang} results={results} />
          </section>
        ))}
      </div>

      {restingTiles.length > 0 && (
        <div className="resting">
          <span className="label">{tx("screen.not_due_today")}</span>
          <span className="small muted">{tx("screen.resting_note")}</span>
          {restingTiles.map((t) => <button key={t} className="chip" onClick={() => setAdded([...added, t])}><span aria-hidden="true" style={{ width: 16, height: 16 }}>{G.plus}</span>{tx("screen.add_tile", { tile: tileName(t) })}</button>)}
        </div>
      )}

      {!crtShown ? (
        <div className="resting">
          <span className="label">{tx("perfusion.optional")}</span>
          <span className="small muted">{tx("perfusion.intro")}</span>
          <button className="chip" onClick={() => setCrtShown(true)}><span aria-hidden="true" style={{ width: 16, height: 16 }}>{G.plus}</span>{tx("perfusion.add")}</button>
        </div>
      ) : (
        <section className={`tile st-${results.crt?.status ?? "none"}`} aria-label={tx("perfusion.title")}>
          <div className="tile-head">
            <span className="label">{tx("perfusion.title")} <span className="small muted">{tx("perfusion.tag")}</span></span>
            <span className="row" style={{ gap: 8 }}>
              {results.crt && <StatusBadge status={results.crt.status} word={tr(`status.${results.crt.status}`, lang)} />}
              <button className="icon-btn" aria-label={tx("screen.how_to_measure", { tile: tx("perfusion.title") })} aria-expanded={howto === "crt"} onClick={() => setHowto(howto === "crt" ? null : "crt")}>{G.info}</button>
            </span>
          </div>
          {howto === "crt" && <p className="howto">{MEASURE.crt}</p>}
          <CrtCapture onResult={onCrtResult} />
          {results.crt && <p className="tile-msg">{(results.crt.why.find((w) => w.layer === "personal" || w.layer === "trend") ?? results.crt.why[0])?.text}</p>}
        </section>
      )}

      <h2 className="section-title">{tx("context.question")}</h2>
      <div className="chips" role="group" aria-label={tx("context.heading")}>
        {(Object.keys(RULES.context) as ContextTag[]).map((c) => (
          <button key={c} className="chip" aria-pressed={tags.includes(c)} onClick={() => toggle(tags, c, setTags)}>{ctxLabel(c, lang)}</button>
        ))}
      </div>
      {tags.some((t) => RULES.context[t].skipPersonal.length) && (
        <p className="small muted" style={{ marginTop: 8 }}>{tx("context.paused_note")}</p>
      )}

      <h2 className="section-title">{tx("symptoms.question")}</h2>
      <div className="chips" role="group" aria-label={tx("symptoms.heading")}>
        {(Object.keys(RULES.symptoms.list) as Symptom[]).map((s) => (
          <button key={s} className="chip sym" aria-pressed={symptoms.includes(s)} onClick={() => toggle(symptoms, s, setSymptoms)}>{symLabel(s, lang)}</button>
        ))}
      </div>
      {symptoms.length > 0 && (
        <div className="banner banner-cmo" style={{ marginTop: 16 }} role="alert">
          <span className="bi" aria-hidden="true">{G.cross}</span>
          <span><b>{tx("symptoms.rule")}</b> {tx("screen.finish_alert_note")}</span>
        </div>
      )}

      <div className="sticky-foot">
        <button className={`btn btn-lg ${symptoms.length ? "btn-danger" : "btn-primary"}`} disabled={anyInvalid || submitting} onClick={() => void finish()}>
          {submitting ? tx("screen.saving") : symptoms.length ? tx("screen.finish_alert") : tx("screen.finish")}
        </button>
        {anyInvalid ? <span className="small" style={{ color: "var(--red-ink)", fontWeight: 700 }}>{tx("screen.fix_first")}</span>
          : <span className="small muted">{tx("screen.indicators", { n: tiles.length })} · {tags.length ? (tags.length > 1 ? tx("screen.notes", { n: tags.length }) : tx("screen.note_one")) : tx("screen.no_notes")} · {tx("screen.nothing_leaves")}</span>}
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

function TileStatus({ t, lang, results, popKey }: { t: Tile; lang?: Lang; results: Partial<Record<Indicator, IndicatorResult>>; popKey: string }) {
  const s = tileStatus(t, results);
  if (s === "none") return null;
  // The status word sits next to the colour glyph in every language.
  return <span key={popKey}><StatusBadge status={s} word={tr(`status.${s}`, lang)} pop /></span>;
}

function TileMessage({ t, lang, results }: { t: Tile; lang?: Lang; results: Partial<Record<Indicator, IndicatorResult>> }) {
  const rs = TILE_INDS[t].map((i) => results[i]).filter(Boolean) as IndicatorResult[];
  const bad = rs.find((r) => r.status === "invalid");
  if (bad) return <p className="tile-msg invalid" role="alert">{bad.why[0].text}</p>;
  const learning = rs.find((r) => r.learning);
  const flagged = rs.find((r) => r.status !== "green");
  if (flagged) {
    const w = flagged.why.find((x) => x.layer === "trend") ?? flagged.why.find((x) => x.layer === "personal" && flagged.band?.position !== "inside") ?? flagged.why.find((x) => x.layer === "redflag") ?? flagged.why[0];
    return <p className="tile-msg">{w.text}</p>;
  }
  if (learning?.learning) return <p className="tile-msg">{tr("screen.learning", lang, { n: learning.learning.n, need: learning.learning.need })}</p>;
  const b = rs[0]?.band;
  return <p className="tile-msg">{b ? `${tr("screen.your_normal", lang)} ${fmt(rs[0].indicator, b.low)}-${fmt(rs[0].indicator, b.high)}` : ""}</p>;
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
