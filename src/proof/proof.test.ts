// Pillar C invariants: the numbers the Crew screen and the pitch quote must
// stay what the pipeline computed from the NASA files (`npm run proof`).
import { describe, expect, it } from "vitest";
import { computeBaseline } from "../engine/baseline";
import { RULES, type Rules } from "../engine/rules";
import type { Indicator } from "../engine/types";
import crewScreen from "../screens/Crew.tsx?raw";
import { PROOF } from "./proof";

const byCrew = Object.fromEntries(PROOF.mcv.crew.map((c) => [c.crew, c]));

describe("Inspiration4 MCV headline", () => {
  it("has the four crew with the hand-checked values", () => {
    const want = { C001: [90.1, 92.8], C002: [90.5, 93.6], C003: [88.7, 91.3], C004: [87.0, 89.6] };
    expect(Object.keys(byCrew).sort()).toEqual(Object.keys(want));
    for (const [id, [r1, preMin]] of Object.entries(want)) {
      expect(byCrew[id].r1, id).toBe(r1);
      expect(byCrew[id].preMin, id).toBe(preMin);
      const pre = byCrew[id].series.filter((p) => p.day < 0).map((p) => p.value);
      expect(pre).toHaveLength(3);
      expect(Math.min(...pre)).toBe(preMin);
    }
  });

  it("4 of 4 below their own lowest pre-flight value, 4 of 4 inside 80-100 fL", () => {
    const { low, high } = PROOF.mcv.population;
    expect([low, high]).toEqual([80, 100]);
    for (const c of PROOF.mcv.crew) {
      expect(c.r1 < c.preMin, c.crew).toBe(true);
      expect(c.r1 >= low && c.r1 <= high, c.crew).toBe(true);
      expect(c.r1BelowOwnMin && c.r1InsidePopulation).toBe(true);
    }
    expect(PROOF.mcv.result).toMatchObject({ n: 4, belowOwnMinAtR1: 4, insidePopulationAtR1: 4 });
    expect(PROOF.mcv.caption).toBe("Population range: 4 of 4 fine. Personal range: 4 of 4 changed.");
  });

  it("states the R+194 caveat it computed (still low in every crew member with a value)", () => {
    expect(PROOF.mcv.result.r194Available).toBe(3);
    expect(PROOF.mcv.result.stillBelowOwnMinAtR194).toBe(3);
    expect(PROOF.limits.map((l) => l.id)).toEqual(expect.arrayContaining(["n4", "pre3", "flight", "noinflight", "r194", "glucose"]));
    expect(PROOF.claimStrength).toMatch(/consistent with/);
  });
});

describe("C003 L-92 row fix", () => {
  it("reconciles after the shift is undone", () => {
    expect(PROOF.fix.row).toBe("C003_whole-blood_L-92_cbc");
    expect(PROOF.fix.checksBefore.filter((c) => c.ok === false).length).toBeGreaterThanOrEqual(5);
    expect(PROOF.fix.checksAfter.every((c) => c.ok === true)).toBe(true);
    const neut = PROOF.fix.moves.find((m) => m.column === "absolute_neutrophils")!;
    expect(neut.raw).toBe(10.1);
    expect(Math.abs(neut.corrected - 71.1 * 9.6 * 10)).toBeLessThan(2);
    expect(PROOF.fix.moves.find((m) => m.column === "absolute_lymphocytes")!.raw).toBe(6826);
    expect(PROOF.fix.mcvAffected).toBe(false);
  });
});

describe("index of individuality", () => {
  it("counts analytes under 0.6 from its own rows", () => {
    const { rows, cutoff, below, n } = PROOF.ii;
    expect(cutoff).toBe(0.6);
    expect(rows).toHaveLength(n);
    expect(rows.filter((r) => r.ii < cutoff)).toHaveLength(below);
    expect([below, n]).toEqual([16, 34]);
    // cvI and cvG are stored rounded to 0.1 %, ii from the unrounded ratio
    for (const r of rows) expect(Math.abs(r.ii * r.cvG - r.cvI), r.analyte).toBeLessThanOrEqual(0.05 + 0.05 * r.ii + 0.005 * r.cvG);
  });

  it("matches the values quoted in the pitch", () => {
    const ii = Object.fromEntries(PROOF.ii.rows.map((r) => [r.analyte, r.ii]));
    expect(ii).toMatchObject({ hemoglobin: 0.36, hematocrit: 0.35, red_blood_cell_count: 0.34, alt: 0.23, platelet_count: 0.43 });
  });
});

describe("same engine runs the science", () => {
  it("was run, and the app's own computeBaseline reproduces its bands", () => {
    const e = PROOF.engine;
    expect(e, "run `npm run proof`").toBeDefined();
    const rules = { ...RULES, indicators: { ...RULES.indicators, mcv: { ...RULES.indicators.glucose, personal: { ruleId: "PROOF-MCV", minHalfWidth: 0, direction: "both" } } } } as unknown as Rules;
    for (const c of e!.crew) {
      const b = computeBaseline("mcv" as unknown as Indicator, e!.inputs[c.crew], rules);
      expect(b.low).toBeCloseTo(c.low, 3);
      expect(b.high).toBeCloseTo(c.high, 3);
      expect(b.ready).toBe(false); // 3 draws < learningChecks: said plainly in the JSON
      expect(c.r1 < b.low).toBe(true);
    }
    expect(e!.result.r1OutsideBand).toBe(4);
    expect(e!.honesty).toMatch(/ready = false/);
  });
});

describe("withdrawn and excluded claims", () => {
  it("glucose is excluded from the headline", () => {
    expect(PROOF.excluded.map((x) => x.analyte)).toContain("glucose");
    expect(PROOF.headline).not.toMatch(/glucose/i);
  });

  it("the lymphocyte drift claim is gone from the screen and the headline", () => {
    expect(PROOF.withdrawn[0].beyond20PctCorrected).toBeLessThan(4);
    expect(PROOF.withdrawn[0].r1PctVsOwnMedianCorrected.C003).toBeCloseTo(0.1, 1);
    expect(crewScreen).not.toMatch(/drift|i4_summary|absolute_lymphocytes/i);
    expect(`${PROOF.headline} ${PROOF.mcv.caption} ${PROOF.limits.map((l) => l.text).join(" ")}`).not.toMatch(/lymphocyte/i);
  });
});
