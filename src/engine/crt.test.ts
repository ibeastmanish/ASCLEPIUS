import { describe, expect, it } from "vitest";
import { estimateCapillaryRefill, type BrightnessSample } from "./crt";

/** Build a synthetic trace: flat dark (lens occluded), an instant exposure
 * jump at release (always abrupt - a covered lens to an open one changes in
 * one frame, however fast the skin itself then recolours), then a separate,
 * slower exponential-ish rise from "just released" to the plateau as colour
 * returns, sampled every `stepMs`. */
function synthetic(opts: {
  darkMs: number;
  dark: number;
  plateau: number;
  refillSeconds: number;
  stepMs?: number;
  tailMs?: number;
  noise?: number;
  releaseJump?: number;
}): BrightnessSample[] {
  const step = opts.stepMs ?? 66; // ~15 fps
  const tail = opts.tailMs ?? 1500;
  const samples: BrightnessSample[] = [];
  let t = 0;
  while (t < opts.darkMs) {
    samples.push({ t, brightness: opts.dark + jitter(opts.noise) });
    t += step;
  }
  const releaseT = t;
  const justReleased = opts.dark + (opts.releaseJump ?? 60);
  samples.push({ t: releaseT, brightness: justReleased + jitter(opts.noise) });
  t += step;
  const rise = opts.plateau - justReleased;
  // Reach ~95% of the rise at `refillSeconds`, then hold the plateau for `tail` ms.
  const tau = (opts.refillSeconds * 1000) / 3; // ~3 time constants to 95%
  const totalMs = opts.refillSeconds * 1000 + tail;
  while (t - releaseT < totalMs) {
    const dt = t - releaseT;
    const v = justReleased + rise * (1 - Math.exp(-dt / Math.max(tau, 1)));
    samples.push({ t, brightness: v + jitter(opts.noise) });
    t += step;
  }
  return samples;
}

function jitter(amp = 0): number {
  return amp ? (Math.random() * 2 - 1) * amp : 0;
}

describe("estimateCapillaryRefill", () => {
  it("reads a clean fast refill (~1.0 s) within tolerance", () => {
    const s = synthetic({ darkMs: 1000, dark: 20, plateau: 180, refillSeconds: 1.0 });
    const r = estimateCapillaryRefill(s);
    expect(r.confidence).toBe("ok");
    expect(r.seconds).toBeGreaterThan(0.6);
    expect(r.seconds).toBeLessThan(1.6);
  });

  it("reads a slow refill (~4.0 s) as slower than a fast one", () => {
    const fast = estimateCapillaryRefill(synthetic({ darkMs: 1000, dark: 15, plateau: 170, refillSeconds: 1.0 }));
    const slow = estimateCapillaryRefill(synthetic({ darkMs: 1000, dark: 15, plateau: 170, refillSeconds: 4.0, tailMs: 2000 }));
    expect(slow.confidence).toBe("ok");
    expect(slow.seconds).toBeGreaterThan(fast.seconds);
    expect(slow.seconds).toBeGreaterThan(2.5);
  });

  it("tolerates sensor noise", () => {
    const s = synthetic({ darkMs: 1200, dark: 25, plateau: 190, refillSeconds: 1.5, noise: 6 });
    const r = estimateCapillaryRefill(s);
    expect(r.confidence).toBe("ok");
    expect(r.seconds).toBeGreaterThan(0.5);
    expect(r.seconds).toBeLessThan(2.5);
  });

  it("flags a flat trace (no finger, or constant lighting) as low-contrast", () => {
    const flat: BrightnessSample[] = Array.from({ length: 40 }, (_, i) => ({ t: i * 66, brightness: 120 + jitter(3) }));
    const r = estimateCapillaryRefill(flat);
    expect(r.confidence).not.toBe("ok");
  });

  it("flags a trace with no release jump", () => {
    const slowDrift: BrightnessSample[] = Array.from({ length: 40 }, (_, i) => ({ t: i * 66, brightness: 100 + i * 0.3 }));
    const r = estimateCapillaryRefill(slowDrift);
    expect(r.confidence).toBe("no-release-detected");
  });

  it("flags too few samples rather than guessing", () => {
    const r = estimateCapillaryRefill([{ t: 0, brightness: 10 }, { t: 66, brightness: 200 }]);
    expect(r.confidence).toBe("not-enough-data");
  });

  it("never returns a negative duration", () => {
    const s = synthetic({ darkMs: 500, dark: 10, plateau: 200, refillSeconds: 0.5 });
    const r = estimateCapillaryRefill(s);
    expect(r.seconds).toBeGreaterThanOrEqual(0);
  });
});
