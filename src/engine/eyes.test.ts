import { describe, expect, it } from "vitest";
import { evaluateEyes, type EyeCheck } from "./eyes";

const check = (i: number, left: Partial<{ cells: number[]; step: number }> = {}, right: Partial<{ cells: number[]; step: number }> = {}): EyeCheck => ({
  id: `e${i}`, ts: `2026-11-${String(i).padStart(2, "0")}T07:00:00Z`, date: `2026-11-${String(i).padStart(2, "0")}`,
  tests: [
    { eye: "left", amslerCells: left.cells ?? [], contrastStep: left.step ?? 6 },
    { eye: "right", amslerCells: right.cells ?? [], contrastStep: right.step ?? 6 },
  ],
});
const history = [check(1), check(2), check(3), check(4)];

describe("weekly eye check (SANS), judged against your own past checks", () => {
  it("clear grid and usual contrast is green", () => {
    const r = evaluateEyes(check(5), history);
    expect(r.status).toBe("green");
    expect(r.learning).toBe(false);
    expect(r.eyes[0].baselineStep).toBe(6);
  });

  it("a new wavy square is yellow; a large area is red", () => {
    expect(evaluateEyes(check(5, { cells: [210, 211] }), history).status).toBe("yellow");
    const big = evaluateEyes(check(5, {}, { cells: Array.from({ length: 12 }, (_, i) => i) }), history);
    expect(big.status).toBe("red");
    expect(big.eyes[1].why[0].ruleId).toBe("EY-R1");
  });

  it("a square that was always marked (a known old spot) is not new", () => {
    const old = [check(1, { cells: [5] }), check(2, { cells: [5] }), check(3, { cells: [5] })];
    expect(evaluateEyes(check(5, { cells: [5] }), old).status).toBe("green");
  });

  it("contrast 2 steps below your usual is yellow, 3 steps is red", () => {
    expect(evaluateEyes(check(5, { step: 4 }), history).eyes[0].why.map((w) => w.ruleId)).toContain("EY-Y2");
    expect(evaluateEyes(check(5, { step: 3 }), history).status).toBe("red");
  });

  it("while learning (fewer than 3 past checks), a poor contrast score asks for a repeat, never red", () => {
    const r = evaluateEyes(check(5, { step: 2 }), [check(1)]);
    expect(r.learning).toBe(true);
    expect(r.status).toBe("yellow");
    expect(r.eyes[0].why[0].ruleId).toBe("EY-Y3");
  });
});
