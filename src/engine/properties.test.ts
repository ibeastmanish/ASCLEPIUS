// Property-based tests (fast-check): invariants over thousands of random checks.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeBaseline } from "./baseline";
import { completeCheck, evaluateReading } from "./evaluate";
import { earthFor } from "./horizons";
import { RULES, matches, rank } from "./rules";
import type { Baselines, CheckInput, ContextTag, Indicator, Symptom } from "./types";
import { INDICATORS } from "./types";

const TAGS: ContextTag[] = ["exercise", "eva", "caffeine", "medication", "woke", "unwell"];
const SYMPTOMS: Symptom[] = ["chest_pain", "breathing", "fainting", "weakness", "confusion", "headache"];

const anyValue = fc.oneof(
  fc.double({ min: -50, max: 1000, noNaN: true }),
  fc.constantFrom(NaN, Infinity, -Infinity, 0),
);
const inRangeValue = (i: Indicator) => {
  const v = RULES.indicators[i].valid;
  return fc.double({ min: v.gte!, max: v.lte!, noNaN: true });
};

const baselineArb: fc.Arbitrary<Baselines> = fc.record(
  Object.fromEntries(INDICATORS.map((i) => [i, fc.option(fc.array(inRangeValue(i), { minLength: 0, maxLength: 20 }), { nil: undefined })])),
).map((m) => {
  const b: Baselines = {};
  for (const [k, v] of Object.entries(m)) if (v) b[k as Indicator] = computeBaseline(k as Indicator, v as number[]);
  return b;
});

const valuesArb = fc.record(
  Object.fromEntries(INDICATORS.map((i) => [i, fc.option(fc.oneof(inRangeValue(i), anyValue), { nil: undefined })])),
  { requiredKeys: [] },
) as fc.Arbitrary<CheckInput["values"]>;

const checkArb = fc.record({
  values: valuesArb,
  tags: fc.uniqueArray(fc.constantFrom(...TAGS)),
  symptoms: fc.uniqueArray(fc.constantFrom(...SYMPTOMS), { maxLength: 2 }),
  baselines: baselineArb,
});

function run(c: { values: CheckInput["values"]; tags: ContextTag[]; symptoms: Symptom[]; baselines: Baselines }) {
  return completeCheck(
    { checkId: "p", ts: "2026-11-14T07:00:00Z", date: "2026-11-14", day: 212, values: c.values, tags: c.tags, symptoms: c.symptoms },
    { baselines: c.baselines, history: [], earlierToday: [], earth: earthFor("2026-11-14") },
  );
}

describe("engine invariants", () => {
  it("invalid input is never coloured", () => {
    fc.assert(fc.property(fc.constantFrom(...INDICATORS), anyValue, baselineArb, (i, v, b) => {
      const r = evaluateReading(i, v, { baselines: b });
      const valid = Number.isFinite(v) && matches(v, RULES.indicators[i].valid);
      expect(r.status === "invalid").toBe(!valid);
    }), { numRuns: 3000 });
  });

  it("overall is never greener than any reading or pattern", () => {
    fc.assert(fc.property(checkArb, (c) => {
      const r = run(c);
      for (const x of r.results) expect(rank(r.overall)).toBeGreaterThanOrEqual(rank(x.status));
      for (const p of r.patterns) expect(rank(r.overall)).toBeGreaterThanOrEqual(rank(p.status));
    }), { numRuns: 1500 });
  });

  it("every coloured result carries at least one why with a rule ID and source", () => {
    fc.assert(fc.property(checkArb, (c) => {
      const r = run(c);
      for (const x of [...r.results, ...r.patterns]) {
        expect(x.why.length).toBeGreaterThan(0);
        for (const w of x.why) {
          expect(w.ruleId).toBeTruthy();
          expect(w.source).toBeTruthy();
          expect(w.text).toBeTruthy();
        }
      }
      expect(r.rulesVersion).toBe(RULES.version);
    }), { numRuns: 1000 });
  });

  it("a red-flag value is always red, whatever the baseline or context chips", () => {
    const redValue = fc.constantFrom(...INDICATORS).chain((i) => {
      const flags = RULES.indicators[i].redflags;
      if (!flags.length) return fc.constant<[Indicator, number] | null>(null);
      return fc.constantFrom(...flags).chain((rf) => {
        const v = RULES.indicators[i].valid;
        const lo = rf.gte ?? (rf.gt !== undefined ? rf.gt + 0.01 : v.gte!);
        const hi = rf.lte ?? (rf.lt !== undefined ? rf.lt - 0.01 : v.lte!);
        return fc.double({ min: Math.max(lo, v.gte!), max: Math.min(hi, v.lte!), noNaN: true }).map((x) => [i, x] as [Indicator, number]);
      });
    });
    fc.assert(fc.property(redValue, fc.uniqueArray(fc.constantFrom(...TAGS)), baselineArb, (iv, tags, b) => {
      if (!iv) return;
      const [i, v] = iv;
      expect(evaluateReading(i, v, { tags, baselines: b }).status).toBe("red");
    }), { numRuns: 2000 });
  });

  it("any symptom makes the whole check red, and context chips never skip it", () => {
    fc.assert(fc.property(checkArb.filter((c) => c.symptoms.length > 0), (c) => {
      const r = run(c);
      expect(r.overall).toBe("red");
      expect(r.escalation).toBe("alert-cmo-and-earth");
    }), { numRuns: 500 });
  });

  it("escalation matches the overall colour", () => {
    fc.assert(fc.property(checkArb, (c) => {
      const r = run(c);
      if (r.overall === "red") expect(r.escalation).toBe("alert-cmo-and-earth");
      else if (r.overall === "yellow") expect(["recheck", "tell-cmo"]).toContain(r.escalation);
      else expect(r.escalation).toBe("none");
    }), { numRuns: 1000 });
  });
});
