// FR-31/32/33: every guidance ID the rules can produce exists, has all four
// card parts, and follows the writing rules.
import { describe, expect, it } from "vitest";
import { RULES } from "../engine/rules";
import { INDICATORS } from "../engine/types";
import { allGuidanceIds, guidance, HAZARDS, MEASURE } from "./guidance";

const DIAGNOSIS_WORDS = /\b(you have (diabetes|hypertension|an infection|covid|depression)|diagnos(is|ed)|disease)\b/i;

describe("guidance library", () => {
  it("covers every guidance ID referenced by rules, on both sides", () => {
    for (const i of INDICATORS) {
      for (const id of Object.values(RULES.indicators[i].guidance)) {
        for (const side of [undefined, "low", "high"] as const) expect(guidance(id, side), `${id}/${side}`).toBeDefined();
      }
    }
    for (const p of Object.values(RULES.patterns)) expect(guidance(p.guidance)).toBeDefined();
    expect(guidance("symptoms-red")).toBeDefined();
  });

  it("has about 20 entries, each with what / why in space / do now / why this check", () => {
    const ids = allGuidanceIds();
    expect(ids.length).toBeGreaterThanOrEqual(20);
    for (const id of ids) {
      const g = guidance(id)!;
      expect(g.what.length).toBeGreaterThan(0);
      expect(HAZARDS[g.hazard]).toBeDefined();
      expect(g.do_now.length).toBeGreaterThan(0);
      expect(g.why_this_check.length).toBeGreaterThan(0);
      expect(g.source.length).toBeGreaterThan(0);
    }
  });

  it("always says when to tell the CMO, and never diagnoses", () => {
    for (const id of allGuidanceIds()) {
      const g = guidance(id)!;
      const text = [g.title, g.what, ...g.do_now, g.escalate_if, g.why_this_check].join(" ");
      expect(text, id).toMatch(/CMO/);
      expect(text, id).not.toMatch(DIAGNOSIS_WORDS);
    }
  });

  it("has a how-to-measure card for every indicator", () => {
    for (const i of INDICATORS) expect(MEASURE[i]).toBeTruthy();
  });
});
