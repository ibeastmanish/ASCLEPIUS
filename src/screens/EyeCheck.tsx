// Weekly eye check (SANS): Amsler grid + contrast letters, one eye at a time.
// Compared with the astronaut's own earlier checks; never a diagnosis.
import { useMemo, useState } from "react";
import { fmtDate } from "../app/clock";
import { useApp } from "../app/store";
import { AMSLER_SIZE, CONTRAST_STEPS, evaluateEyes, EYE_RULES, type Eye, type EyeCheck as EyeCheckT, type EyeResult, type EyeTest } from "../engine/eyes";
import { Disclaimer, StatusBadge, TopBar } from "../ui/ui";

const LETTERS = ["C", "D", "H", "K", "N", "O", "R", "S", "V", "Z"];
type Step = "intro" | "grid" | "contrast" | "result";
const WORD = { green: "No change", yellow: "Tell the CMO this week", red: "Tell the CMO today" } as const;

function pick<T>(xs: T[], n: number, must: T): T[] {
  const rest = xs.filter((x) => x !== must).sort(() => Math.random() - 0.5).slice(0, n - 1);
  return [...rest, must].sort(() => Math.random() - 0.5);
}

export function EyeCheck() {
  const app = useApp();
  const { state, today, now } = app;
  const [step, setStep] = useState<Step>("intro");
  const [eye, setEye] = useState<Eye>("left");
  const [cells, setCells] = useState<number[]>([]);
  const [level, setLevel] = useState(0);
  const [tests, setTests] = useState<EyeTest[]>([]);
  const [result, setResult] = useState<EyeResult | null>(null);
  const [saved, setSaved] = useState(false);
  const letter = useMemo(() => LETTERS[Math.floor(Math.random() * LETTERS.length)], [level, eye, step]); // eslint-disable-line react-hooks/exhaustive-deps
  const choices = useMemo(() => pick(LETTERS, 4, letter), [letter]);
  const last = state.eyeChecks.at(-1);

  function finishEye(contrastStep: number) {
    const t: EyeTest = { eye, amslerCells: cells, contrastStep };
    const all = [...tests, t];
    setTests(all);
    setCells([]);
    setLevel(0);
    if (eye === "left") { setEye("right"); setStep("grid"); return; }
    const check: EyeCheckT = { id: `eyes-${now.getTime()}`, ts: now.toISOString(), date: today, tests: all };
    setResult(evaluateEyes(check, state.eyeChecks));
    setStep("result");
    void app.recordEye(check).then(() => setSaved(true));
  }

  function answer(ok: boolean) {
    if (!ok) { finishEye(level - 1); return; }
    if (level === CONTRAST_STEPS.length - 1) { finishEye(level); return; }
    setLevel(level + 1);
  }

  const cover = eye === "left" ? "right" : "left";
  return (
    <>
      <TopBar title="Eye check"><span>Weekly · about 2 minutes · {state.eyeChecks.length} earlier checks{last ? `, last on ${fmtDate(last.date)}` : ""}</span></TopBar>

      {step === "intro" && (
        <section className="eye-card">
          <h2>Why check your eyes in space?</h2>
          <p>Long missions can change the back of the eye and the optic nerve (Spaceflight-Associated Neuro-ocular Syndrome, SANS). On the ISS, astronauts check their vision with an Amsler grid on a laptop. This weekly check does the same on the tablet, plus a faint-letter test, and compares you with <b>your own</b> earlier results.</p>
          <ol>
            <li>Same place, same light, tablet at arm&apos;s length, wear your usual glasses.</li>
            <li>Cover one eye at a time. Look only at the centre dot of the grid.</li>
            <li>Tap any square that looks wavy, blurred or missing. Then read the faintest letters you can.</li>
          </ol>
          <p className="small muted">A tablet screen is not calibrated, so this never diagnoses anything. It tells you when to show the crew medical officer.</p>
          <button className="btn btn-primary btn-lg" onClick={() => setStep("grid")}>Start with the left eye</button>
        </section>
      )}

      {step === "grid" && (
        <section className="eye-card">
          <span className="label">{eye === "left" ? "Left" : "Right"} eye · Amsler grid</span>
          <h2>Cover your {cover} eye. Look at the centre dot.</h2>
          <p>Tap any square that looks wavy, blurred or missing. Tap again to undo. If everything looks straight, tap <b>All lines look straight</b>.</p>
          <div className="amsler" role="grid" aria-label={`Amsler grid, ${eye} eye`} style={{ gridTemplateColumns: `repeat(${AMSLER_SIZE}, 1fr)` }}>
            {Array.from({ length: AMSLER_SIZE * AMSLER_SIZE }, (_, i) => (
              <button key={i} role="gridcell" aria-label={`square ${Math.floor(i / AMSLER_SIZE) + 1}, ${(i % AMSLER_SIZE) + 1}`} aria-pressed={cells.includes(i)}
                className={cells.includes(i) ? "on" : ""} onClick={() => setCells(cells.includes(i) ? cells.filter((c) => c !== i) : [...cells, i])} />
            ))}
            <span className="amsler-dot" aria-hidden="true" />
          </div>
          <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => setStep("contrast")}>{cells.length ? `Done: ${cells.length} square${cells.length === 1 ? "" : "s"} marked` : "All lines look straight"}</button>
            {cells.length > 0 && <button className="btn" onClick={() => setCells([])}>Clear</button>}
          </div>
        </section>
      )}

      {step === "contrast" && (
        <section className="eye-card">
          <span className="label">{eye === "left" ? "Left" : "Right"} eye · faint letters · step {level + 1} of {CONTRAST_STEPS.length}</span>
          <h2>Keep your {cover} eye covered. Which letter is this?</h2>
          <div className="contrast-box" aria-label="letter on a white panel">
            <span style={{ color: `rgb(${Math.round(255 * (1 - CONTRAST_STEPS[level]))} ${Math.round(255 * (1 - CONTRAST_STEPS[level]))} ${Math.round(255 * (1 - CONTRAST_STEPS[level]))})` }}>{letter}</span>
          </div>
          <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
            {choices.map((c) => <button key={c} className="btn btn-lg" style={{ minWidth: 72 }} onClick={() => answer(c === letter)}>{c}</button>)}
            <button className="btn" onClick={() => answer(false)}>I can&apos;t see it</button>
          </div>
        </section>
      )}

      {step === "result" && result && (
        <section className="eye-card">
          <div className="row" style={{ gap: 14, alignItems: "center" }}>
            <StatusBadge status={result.status} word={WORD[result.status]} large />
          </div>
          <p style={{ marginTop: 12 }}>{result.advice}</p>
          <div className="eye-results">
            {result.eyes.map((e) => (
              <div key={e.eye} className={`eye-res s-${e.status}`}>
                <b>{e.eye === "left" ? "Left eye" : "Right eye"}</b>
                <span className="small">Grid: {e.marked ? `${e.marked} square${e.marked === 1 ? "" : "s"} marked` : "clear"} · Faintest letter: step {e.contrastStep + 1}{e.baselineStep !== undefined ? ` (your usual: ${e.baselineStep + 1})` : ""}</span>
                <ul>{e.why.map((w) => <li key={w.ruleId}><span className="small muted">{w.ruleId}</span> {w.text}</li>)}</ul>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>{saved ? "Saved, encrypted, on this tablet." : "Saving…"} {result.learning ? "Still learning your usual (3 checks needed). " : ""}Source: {EYE_RULES.source}</p>
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <a className="btn btn-primary" href="#/home">Done</a>
            <button className="btn" onClick={() => { setTests([]); setEye("left"); setResult(null); setSaved(false); setStep("intro"); }}>Check again</button>
          </div>
        </section>
      )}
      <Disclaimer />
    </>
  );
}
