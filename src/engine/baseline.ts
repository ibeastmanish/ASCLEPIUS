// Personal baseline, "normal for YOU" (PRD 7.4).
// median + scaled MAD over the last 30 learning values, minimum half-width,
// then a slow EWMA drift of the centre from green in-flight checks only.
import { RULES, type Rules } from "./rules";
import type { Baseline, Indicator } from "./types";

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function emptyBaseline(indicator: Indicator): Baseline {
  return { indicator, window: [], n: 0, ready: false, median: NaN, spread: NaN, half: NaN, center: NaN, low: NaN, high: NaN };
}

/** Compute a band from a list of values (PRD 7.4 `personal_band`). */
export function computeBaseline(indicator: Indicator, values: number[], rules: Rules = RULES): Baseline {
  const { learningChecks, window, madScale, k } = rules.baseline;
  const w = values.slice(-window);
  if (w.length === 0) return emptyBaseline(indicator);
  const m = median(w);
  const spread = madScale * median(w.map((v) => Math.abs(v - m)));
  const half = Math.max(k * spread, rules.indicators[indicator].personal.minHalfWidth);
  return {
    indicator,
    window: w,
    n: w.length,
    ready: w.length >= learningChecks,
    median: m,
    spread,
    half,
    center: m,
    low: m - half,
    high: m + half,
  };
}

/** Add a learning value (pre-flight, or in flight before the band is ready). */
export function learn(b: Baseline | undefined, indicator: Indicator, value: number, rules: Rules = RULES): Baseline {
  return computeBaseline(indicator, [...(b?.window ?? []), value], rules);
}

/** In-flight update after a green check (PRD 7.4 `update_after_green`). */
export function updateAfterGreen(b: Baseline, value: number, rules: Rules = RULES): Baseline {
  if (!b.ready) return b;
  const a = rules.baseline.ewmaAlpha;
  const center = (1 - a) * b.center + a * value;
  return { ...b, center, low: center - b.half, high: center + b.half };
}

/**
 * Decide how one accepted reading moves the baseline.
 * Pre-flight values (or any value while still learning) go into the window;
 * once ready in flight, only green values nudge the centre, never yellow/red.
 */
export function nextBaseline(
  b: Baseline | undefined,
  indicator: Indicator,
  value: number,
  opts: { preflight: boolean; green: boolean },
  rules: Rules = RULES,
): Baseline {
  if (opts.preflight || !b || !b.ready) return learn(b, indicator, value, rules);
  return opts.green ? updateAfterGreen(b, value, rules) : b;
}
