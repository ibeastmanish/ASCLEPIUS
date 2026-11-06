// Capillary refill time (CRT) estimator (experimental, optional 7th check).
//
// The challenge brief explicitly allows "camera images" as a health-indicator
// input. HYGIEA's required six readings (PRODUCT.md) are untouched; this is
// an opt-in add-on that turns a phone/tablet camera into a simple bedside
// perfusion test: press a fingertip over the lens to blanch it, release, and
// time how long the skin takes to pink up again.
//
// This module is pure signal processing on a brightness time series - no AI,
// no ML model, every step is a readable rule, exactly like rules.json. The
// capture layer (src/ui/CrtCapture.tsx) is responsible for turning camera
// frames into samples; this file never touches the DOM or the camera, so it
// is fully unit-testable with synthetic data.
//
// Clinical note [VERIFY]: this is a self-administered, uncalibrated test. It
// is not equivalent to a flight surgeon's bedside capillary refill check.
// Treat it as decision support, not a diagnosis, like every other indicator.

export interface BrightnessSample {
  /** Milliseconds since sampling started. */
  t: number;
  /** Mean frame brightness, 0-255 (e.g. average luma of the sampled region). */
  brightness: number;
}

export type CrtConfidence = "ok" | "low-contrast" | "no-release-detected" | "not-enough-data";

export interface CrtEstimate {
  /** Estimated refill time in seconds, from release to ~90% recovered. NaN if it could not be computed. */
  seconds: number;
  /** Index into `samples` where the finger was judged to have been released. */
  releaseIndex: number;
  /** Brightness while the finger occluded the lens (the darkest sustained stretch). */
  trough: number;
  /** Brightness once the signal has settled (median of the final samples). */
  plateau: number;
  confidence: CrtConfidence;
}

const MIN_SAMPLES = 8;
/** A release is a jump at least this many brightness levels (0-255) within one step. */
const RELEASE_JUMP = 18;
/** Refill is "done" once the signal has recovered this fraction of the trough-to-plateau rise. */
const RECOVER_FRACTION = 0.9;
/** Below this trough-to-plateau rise, the signal is too flat to time reliably (e.g. no finger, bad lighting). */
const MIN_CONTRAST = 12;

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Estimate capillary refill time from a brightness time series.
 *
 * Expects samples to cover: a sustained dark stretch (finger pressed on the
 * lens, blocking light), one sharp upward jump (release), then a rise that
 * settles into a plateau (colour has returned). Everything before the release
 * is ignored except to establish the trough.
 */
export function estimateCapillaryRefill(samples: BrightnessSample[]): CrtEstimate {
  const empty = (confidence: CrtConfidence): CrtEstimate => ({ seconds: NaN, releaseIndex: -1, trough: NaN, plateau: NaN, confidence });
  if (samples.length < MIN_SAMPLES) return empty("not-enough-data");

  // 1. Find the release: the largest one-step upward jump in the first two-thirds
  // of the recording (a real release happens early; a late jump is more likely noise).
  const searchEnd = Math.max(1, Math.floor(samples.length * (2 / 3)));
  let releaseIndex = -1;
  let biggestJump = RELEASE_JUMP;
  for (let i = 1; i < searchEnd; i++) {
    const jump = samples[i].brightness - samples[i - 1].brightness;
    if (jump >= biggestJump) {
      biggestJump = jump;
      releaseIndex = i;
    }
  }
  if (releaseIndex === -1) return empty("no-release-detected");

  // 2. Trough: the brightness right after release, while the fingertip is still
  // blanched. (The pre-release reading is the occluded lens, which carries no
  // colour information at all, so it is the wrong reference point to time from.)
  const justAfter = samples.slice(releaseIndex, Math.min(samples.length, releaseIndex + 4)).map((s) => s.brightness);
  const trough = justAfter.length ? Math.min(...justAfter) : samples[releaseIndex].brightness;

  // 3. Plateau: the settled brightness, read from the last fifth of the recording.
  const tailStart = Math.max(releaseIndex + 1, Math.floor(samples.length * 0.8));
  const tail = samples.slice(tailStart).map((s) => s.brightness);
  const plateau = tail.length ? median(tail) : samples[samples.length - 1].brightness;

  const rise = plateau - trough;
  if (rise < MIN_CONTRAST) return { seconds: NaN, releaseIndex, trough, plateau, confidence: "low-contrast" };

  // 4. Refill time: first moment after release the signal crosses 90% of the way
  // from trough to plateau, and stays there (avoids tripping on a brief flicker).
  const target = trough + RECOVER_FRACTION * rise;
  for (let i = releaseIndex; i < samples.length; i++) {
    if (samples[i].brightness < target) continue;
    const holds = samples.slice(i, Math.min(samples.length, i + 3)).every((s) => s.brightness >= target);
    if (holds) {
      const seconds = (samples[i].t - samples[releaseIndex].t) / 1000;
      return { seconds: Math.max(0, seconds), releaseIndex, trough, plateau, confidence: "ok" };
    }
  }

  // Never recovered within the recording: report the full window as a lower bound,
  // flagged for a retest rather than silently under-reporting.
  const seconds = (samples[samples.length - 1].t - samples[releaseIndex].t) / 1000;
  return { seconds: Math.max(0, seconds), releaseIndex, trough, plateau, confidence: "low-contrast" };
}
