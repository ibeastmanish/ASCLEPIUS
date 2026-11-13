import { describe, expect, it } from "vitest";
import {
  linkFor,
  actWindow, computeReplyClock, formatDuration, houstonTime, replyClockForCheck, solsUntilAlignedMorning,
  spaceLink, surgeonOnShift, surgeonResponseMin, waitForContactMs, type Link,
} from "./replyclock";
import { RULES, type Rules } from "./rules";
import type { CheckResult, PatternResult } from "./types";

// Surgeon shift in rules: 13:00-01:00 UTC (07:00-19:00 Houston, UTC-6).
const ON = "2026-11-14T15:00:00.000Z";
const OFF = "2026-11-14T05:00:00.000Z";

function check(over: Partial<CheckResult>): Pick<CheckResult, "overall" | "escalation" | "patterns" | "ts" | "date"> {
  return { overall: "yellow", escalation: "recheck", patterns: [], ts: ON, date: "2026-11-14", ...over };
}
function pattern(id: string): PatternResult {
  return { id, status: "yellow", indicators: [], regions: [], why: [], guidanceId: "", tellCmo: true };
}
const link = (oneWayMin: number): Link => ({ oneWayMin, blackout: false, source: "test" });

describe("shift and timing helpers", () => {
  it("knows the surgeon's shift in UTC and Houston time", () => {
    expect(surgeonOnShift(Date.parse(ON))).toBe(true);
    expect(surgeonOnShift(Date.parse(OFF))).toBe(false);
    expect(houstonTime(Date.parse(ON))).toBe("09:00");
  });

  it("red is paged off shift; routine waits for the next shift", () => {
    expect(surgeonResponseMin("red", Date.parse(OFF))).toBe(30);
    expect(surgeonResponseMin("routine", Date.parse(OFF))).toBe(8 * 60 + 60); // 05:00 -> 13:00 UTC, then 60 min
    expect(surgeonResponseMin("routine", Date.parse(ON))).toBe(60);
  });

  it("formats durations for people", () => {
    expect(formatDuration(27)).toBe("27 min");
    expect(formatDuration(108)).toBe("1 h 48 min");
    expect(formatDuration(Infinity)).toMatch(/blackout/);
  });
});

describe("act-by windows", () => {
  it("red is the shortest window; patterns use their own; yellow uses the escalation", () => {
    expect(actWindow(check({ overall: "red", escalation: "alert-cmo-and-earth" }))).toMatchObject({ min: 10, priority: "red" });
    expect(actWindow(check({ patterns: [pattern("PT-FEVER")], escalation: "tell-cmo" }))).toMatchObject({ min: 240 });
    expect(actWindow(check({ patterns: [pattern("PT-FEVER"), pattern("PT-ORTHO")] }))).toMatchObject({ min: 60 });
    expect(actWindow(check({ escalation: "tell-cmo" }))).toMatchObject({ min: 1440 });
    expect(actWindow(check({ overall: "green", escalation: "none" }))).toBeNull();
  });
});

describe("Earth Reply Clock", () => {
  it("Mars red: Earth's answer (11 + 5 + 11 min) comes after the 10-min window, so the crew decides", () => {
    const c = replyClockForCheck(check({ overall: "red", escalation: "alert-cmo-and-earth" }), "mars")!;
    expect(c.earliestReplyMin).toBeCloseTo(11.01 * 2 + 5, 1);
    expect(c.level).toBe("crew-decides");
    expect(c.sentence).toMatch(/crew medical officer decides now/);
    expect(c.steps.map((s) => s.assumed)).toEqual([false, true, false]);
  });

  it("Moon red: a 1.3 s link means Earth can be consulted inside the window", () => {
    const c = replyClockForCheck(check({ overall: "red", escalation: "alert-cmo-and-earth" }), "moon")!;
    expect(c.earliestReplyMin).toBeLessThan(10);
    expect(c.level).toBe("earth-consulted");
  });

  it("the same finding gets a different level at a short and a long light time", () => {
    const base = { nowMs: Date.parse(ON), priority: "routine" as const, actWithinMin: 150, actBasis: "t", mission: "mars" as const };
    expect(computeReplyClock({ ...base, link: link(4) }).level).toBe("earth-guided"); // 68 < 75
    expect(computeReplyClock({ ...base, link: link(22) }).level).toBe("earth-consulted"); // 104 < 150
    expect(computeReplyClock({ ...base, link: link(22), actWithinMin: 90 }).level).toBe("crew-decides");
  });

  it("off shift, a fever pattern waits for the surgeon's shift, so the crew decides", () => {
    const on = replyClockForCheck(check({ patterns: [pattern("PT-FEVER")], escalation: "tell-cmo" }), "mars")!;
    expect(on.level).toBe("earth-guided");
    const off = replyClockForCheck(check({ ts: OFF, patterns: [pattern("PT-FEVER")], escalation: "tell-cmo" }), "mars")!;
    expect(off.surgeonOnShiftAtArrival).toBe(false);
    expect(off.level).toBe("crew-decides");
  });

  it("during the Sun blackout the crew always decides, and the reply waits for the link", () => {
    const c = replyClockForCheck(check({ date: "2028-03-20", ts: "2028-03-20T15:00:00.000Z", escalation: "tell-cmo" }), "mars")!;
    expect(c.blackout).toBe(true);
    expect(c.level).toBe("crew-decides");
    expect(c.steps[0].label).toMatch(/blackout/);
    expect(Date.parse(c.replyAt!)).toBeGreaterThan(Date.parse(`${c.blackoutEnd}T00:00:00Z`));
  });

  it("uses the real JPL Horizons light time for the date, with its source", () => {
    const l = spaceLink("2028-01-14", "mars");
    expect(l.oneWayMin).toBeCloseTo(19.25, 2);
    expect(l.source).toMatch(/2028-01-14/);
    expect(spaceLink("2035-01-01", "mars").estimated).toBe(true);
  });

  it("an optional contact window adds a wait when the window is closed", () => {
    const windowed: Rules = { ...RULES, replyClock: { ...RULES.replyClock, contact: { ...RULES.replyClock.contact, mode: "windowed" } } };
    const waits = Array.from({ length: 24 }, (_, h) => waitForContactMs(Date.parse(ON) + h * 3_600_000, "mars", undefined, windowed));
    expect(waits.some((w) => w === 0)).toBe(true);
    expect(waits.some((w) => w > 0)).toBe(true);
    expect(waitForContactMs(Date.parse(ON), "moon", undefined, windowed)).toBe(0);
  });

  it("Mars-sol drift: the morning check lines up with the surgeon's shift again within ~37 sols", () => {
    const k = solsUntilAlignedMorning(Date.parse(OFF))!;
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThanOrEqual(37);
  });
});

describe("Delay is delay: clinic mode", () => {
  it("uses travel time and clinic hours instead of light time and the surgeon's shift", () => {
    const clinic = { on: true, travelMin: 180, openHour: 9, closeHour: 17, tzOffsetMin: 330, name: "the PHC doctor" };
    const l = linkFor("2026-11-14", "mars", clinic);
    expect(l.oneWayMin).toBe(180);
    expect(l.far).toBe("the PHC doctor");
    // 11:00 IST = 05:30 UTC: clinic open. Routine finding, 24 h window: 3 h + 30 min + 3 h = 6.5 h -> earth-guided.
    const open = computeReplyClock({ nowMs: Date.parse("2026-11-14T05:30:00Z"), link: l, priority: "routine", actWithinMin: 1440, actBasis: "t", mission: "mars" });
    expect(open.earliestReplyMin).toBeCloseTo(390, 0);
    expect(open.level).toBe("earth-guided");
    expect(open.sentence).toMatch(/PHC doctor/);
    // Red at 22:00 IST (clinic closed): 3 h + 60 min + 3 h is far past a 10-min window -> act now.
    const night = computeReplyClock({ nowMs: Date.parse("2026-11-14T16:30:00Z"), link: l, priority: "red", actWithinMin: 10, actBasis: "t", mission: "mars" });
    expect(night.level).toBe("crew-decides");
    expect(night.steps.some((s) => /clinic closed/.test(s.label))).toBe(true);
    expect(linkFor("2026-11-14", "mars", { ...clinic, on: false }).source).toMatch(/Horizons/);
  });
});
