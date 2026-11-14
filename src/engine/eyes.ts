// Weekly eye check for Spaceflight-Associated Neuro-ocular Syndrome (SANS).
// Two quick self-tests per eye on the tablet: an Amsler grid (tap any square
// that looks wavy, blurred or missing) and a contrast check (the faintest
// letter you can still read). Compared with your OWN past results, because a
// tablet screen is not calibrated: this never diagnoses; it says when to tell
// the crew medical officer. Pure functions.

export type Eye = "left" | "right";

/** Weber contrast of each step of the letter test, strongest to faintest. */
export const CONTRAST_STEPS = [1, 0.5, 0.25, 0.125, 0.0625, 0.0313, 0.0156, 0.0078];
export const AMSLER_SIZE = 20; // 20 x 20 squares

export interface EyeTest {
  eye: Eye;
  /** Indices (row * AMSLER_SIZE + col) of squares the astronaut marked. */
  amslerCells: number[];
  /** Index into CONTRAST_STEPS of the faintest letter read correctly; -1 if none. */
  contrastStep: number;
}

export interface EyeCheck {
  id: string;
  ts: string;
  date: string;
  tests: EyeTest[];
}

export type EyeStatus = "green" | "yellow" | "red";

export interface EyeEyeResult {
  eye: Eye;
  status: EyeStatus;
  marked: number;
  contrastStep: number;
  /** Personal contrast baseline (median step of earlier checks), when there are enough. */
  baselineStep?: number;
  why: { ruleId: string; text: string }[];
}

export interface EyeResult {
  status: EyeStatus;
  eyes: EyeEyeResult[];
  learning: boolean;
  advice: string;
}

export const EYE_RULES = {
  learningChecks: 3,
  redCells: 12,
  redStepDrop: 3,
  yellowStepDrop: 2,
  /** Before a personal baseline exists: not reading the 6.25% letter is worth a look. */
  populationMinStep: 4,
  source: "NASA: on the ISS, in-flight vision checks include an Amsler grid run on a laptop (NTRS 20170009173); NASA Ames studies tablet-based contrast tests (Frontiers in Ophthalmology 2023); NASA HRP Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS). Thresholds here are project-defined.",
} as const;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.floor((s[m - 1] + s[m]) / 2);
}

const worse = (a: EyeStatus, b: EyeStatus): EyeStatus => (a === "red" || b === "red" ? "red" : a === "yellow" || b === "yellow" ? "yellow" : "green");

/** Judge today's eye check against the astronaut's own earlier checks (oldest first). */
export function evaluateEyes(today: EyeCheck, history: EyeCheck[]): EyeResult {
  const eyes: EyeEyeResult[] = today.tests.map((t) => {
    const past = history.flatMap((h) => h.tests.filter((x) => x.eye === t.eye));
    const why: EyeEyeResult["why"] = [];
    let status: EyeStatus = "green";
    const marked = new Set(t.amslerCells).size;
    const pastMarked = past.length ? Math.max(...past.map((p) => new Set(p.amslerCells).size)) : 0;
    const baselineStep = past.length >= EYE_RULES.learningChecks ? median(past.slice(-6).map((p) => p.contrastStep)) : undefined;

    if (marked >= EYE_RULES.redCells) {
      status = "red";
      why.push({ ruleId: "EY-R1", text: `${marked} squares look wavy, blurred or missing. A large change in vision needs the crew medical officer today.` });
    } else if (marked > pastMarked) {
      status = worse(status, "yellow");
      why.push({ ruleId: "EY-Y1", text: `${marked} square${marked === 1 ? "" : "s"} marked, more than in your earlier checks (${pastMarked}). New distortion is worth showing the crew medical officer.` });
    }

    if (baselineStep !== undefined) {
      const drop = baselineStep - t.contrastStep;
      if (drop >= EYE_RULES.redStepDrop) {
        status = "red";
        why.push({ ruleId: "EY-R2", text: `Contrast is ${drop} steps below your usual (step ${baselineStep}). A sudden drop needs the crew medical officer today.` });
      } else if (drop >= EYE_RULES.yellowStepDrop) {
        status = worse(status, "yellow");
        why.push({ ruleId: "EY-Y2", text: `Contrast is ${drop} steps below your usual (step ${baselineStep}). Tell the crew medical officer this week.` });
      }
    } else if (t.contrastStep < EYE_RULES.populationMinStep) {
      status = worse(status, "yellow");
      why.push({ ruleId: "EY-Y3", text: "Still learning your usual. The faint letters were hard to read; repeat in good light and tell the crew medical officer if it stays the same." });
    }
    if (!why.length) why.push({ ruleId: "EY-G", text: baselineStep !== undefined ? `Grid clear and contrast at your usual (step ${t.contrastStep} vs ${baselineStep}).` : "Grid clear and faint letters readable. Learning your usual." });
    return { eye: t.eye, status, marked, contrastStep: t.contrastStep, baselineStep, why };
  });

  const status = eyes.reduce<EyeStatus>((w, e) => worse(w, e.status), "green");
  const learning = eyes.some((e) => e.baselineStep === undefined);
  const advice = status === "red" ? "Tell the crew medical officer today. Changes in vision are a known spaceflight risk (SANS); Earth will see this in the next digest."
    : status === "yellow" ? "Tell the crew medical officer this week, and repeat the check in 2-3 days in the same light."
    : "No change. Repeat next week.";
  return { status, eyes, learning, advice };
}
