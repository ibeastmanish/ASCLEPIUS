import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { computeBaseline, median, nextBaseline, updateAfterGreen } from "./baseline";
import { addDays, completeCheck, evaluateReading, toDayRecord } from "./evaluate";
import { blackoutEnd, earthFor, isBlackout, oneWayMin, series } from "./horizons";
import { localMarsHours, nextLocalTime, SOL_SECONDS } from "./mars";
import rulesJson from "./rules.json";
import schema from "./rules.schema.json";
import { RULES, matches, worst } from "./rules";
import type { Baselines, CheckInput, CheckResult, DayRecord, EngineContext, Indicator } from "./types";
import { INDICATORS } from "./types";

const ASHA_HR = [55, 57, 58, 56, 59, 57, 54, 60, 57, 58];

function baselinesFrom(map: Partial<Record<Indicator, number[]>>): Baselines {
  const b: Baselines = {};
  for (const [k, v] of Object.entries(map)) b[k as Indicator] = computeBaseline(k as Indicator, v!);
  return b;
}

const ASHA_BASE = baselinesFrom({
  hr: ASHA_HR,
  bp_sys: [114, 116, 118, 115, 117, 116, 119, 115, 116, 118],
  bp_dia: [74, 75, 76, 74, 75, 73, 77, 75, 74, 76],
  glucose: [88, 90, 92, 89, 91, 90, 87, 93, 90, 89],
  temp: [36.7, 36.8, 36.6, 36.8, 36.7, 36.9, 36.7, 36.8, 36.7, 36.8],
  sleep: [7.5, 7.0, 8.0, 7.5, 7.5, 7.0, 8.0, 7.5, 7.0, 7.5],
  mood: [4, 4, 5, 4, 4, 3, 4, 5, 4, 4],
});

const EARTH_NOV14 = earthFor("2026-11-14");

function ctx(over: Partial<EngineContext> = {}): EngineContext {
  return { baselines: ASHA_BASE, history: [], earlierToday: [], earth: EARTH_NOV14, ...over };
}

function input(values: CheckInput["values"], over: Partial<CheckInput> = {}): CheckInput {
  return { checkId: "c1", ts: "2026-11-14T07:00:00.000Z", date: "2026-11-14", day: 212, values, tags: [], symptoms: [], ...over };
}

function day(date: string, values: DayRecord["values"], aboveHr = false): DayRecord {
  return { date, day: 0, values, statuses: {}, aboveBand: { hr: aboveHr }, belowBand: {} };
}

// ----------------------------------------------------------------- rules file
describe("rules.json", () => {
  it("matches its JSON Schema", () => {
    const ajv = new Ajv2020({ allErrors: true });
    const validate = ajv.compile(schema);
    const ok = validate(rulesJson);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it("has a version and a rule for every indicator", () => {
    expect(RULES.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const i of INDICATORS) {
      const r = RULES.indicators[i];
      expect(r.clinical.ruleId).toBeTruthy();
      expect(r.personal.ruleId).toBeTruthy();
      expect(r.valid.ruleId).toBeTruthy();
    }
  });

  it("rule IDs are unique", () => {
    const ids: string[] = [];
    for (const i of INDICATORS) {
      const r = RULES.indicators[i];
      ids.push(r.valid.ruleId, r.clinical.ruleId, r.personal.ruleId, ...r.redflags.map((x) => x.ruleId));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ------------------------------------------------- every threshold, at/below/above
describe("thresholds (no baseline)", () => {
  const ev = (i: Indicator, v: number) => evaluateReading(i, v).status;
  const step = (i: Indicator) => RULES.indicators[i].step;

  for (const i of INDICATORS) {
    const r = RULES.indicators[i];
    it(`${i}: valid range edges`, () => {
      expect(ev(i, r.valid.gte!)).not.toBe("invalid");
      expect(ev(i, r.valid.lte!)).not.toBe("invalid");
      expect(ev(i, r.valid.gte! - step(i))).toBe("invalid");
      expect(ev(i, r.valid.lte! + step(i))).toBe("invalid");
      expect(ev(i, NaN)).toBe("invalid");
    });
    for (const rf of r.redflags) {
      it(`${i}: red flag ${rf.ruleId} at, inside and outside its limit`, () => {
        const s = step(i);
        if (rf.gte !== undefined) { expect(ev(i, rf.gte)).toBe("red"); expect(ev(i, rf.gte + s)).toBe("red"); expect(ev(i, rf.gte - s)).not.toBe("red"); }
        if (rf.gt !== undefined) { expect(ev(i, rf.gt)).not.toBe("red"); expect(ev(i, rf.gt + s)).toBe("red"); }
        if (rf.lt !== undefined) { expect(ev(i, rf.lt)).not.toBe("red"); expect(ev(i, rf.lt - s)).toBe("red"); }
        if (rf.lte !== undefined) { expect(ev(i, rf.lte)).toBe("red"); expect(ev(i, rf.lte + s)).not.toBe("red"); }
      });
    }
    it(`${i}: clinical green band edges`, () => {
      const g = r.clinical.green;
      const s = step(i);
      if (g.gte !== undefined) { expect(ev(i, g.gte)).toBe("green"); expect(ev(i, g.gte - s)).not.toBe("green"); }
      if (g.gt !== undefined) { expect(ev(i, g.gt)).not.toBe("green"); expect(ev(i, g.gt + s)).toBe("green"); }
      if (g.lt !== undefined) { expect(ev(i, g.lt)).not.toBe("green"); expect(ev(i, g.lt - s)).toBe("green"); }
      if (g.lte !== undefined) { expect(ev(i, g.lte)).toBe("green"); expect(ev(i, g.lte + s)).not.toBe("green"); }
    });
  }

  it("matches the PRD 9.1 table at sample points", () => {
    const cases: [Indicator, number, string][] = [
      ["bp_sys", 129, "green"], ["bp_sys", 130, "yellow"], ["bp_sys", 179, "yellow"], ["bp_sys", 180, "red"],
      ["bp_dia", 79, "green"], ["bp_dia", 80, "yellow"], ["bp_dia", 119, "yellow"], ["bp_dia", 120, "red"],
      ["hr", 60, "green"], ["hr", 100, "green"], ["hr", 55, "yellow"], ["hr", 110, "yellow"], ["hr", 39, "red"], ["hr", 131, "red"],
      ["glucose", 70, "green"], ["glucose", 99, "green"], ["glucose", 100, "yellow"], ["glucose", 54, "yellow"], ["glucose", 53, "red"], ["glucose", 250, "red"],
      ["temp", 36.1, "green"], ["temp", 37.9, "green"], ["temp", 38.0, "yellow"], ["temp", 39.4, "yellow"], ["temp", 39.5, "red"], ["temp", 34.9, "red"],
      ["sleep", 7, "green"], ["sleep", 6.5, "yellow"], ["sleep", 5, "yellow"],
      ["mood", 3, "green"], ["mood", 2, "yellow"],
    ];
    for (const [i, v, s] of cases) expect(`${i}=${v}:${ev(i, v)}`).toBe(`${i}=${v}:${s}`);
  });
});

// ------------------------------------------------------------------ baseline
describe("personal baseline (PRD 7.4)", () => {
  it("median handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("worked example 7.5: Asha's HR band is 52-62", () => {
    const b = computeBaseline("hr", ASHA_HR);
    expect(b.median).toBe(57);
    expect(b.spread).toBeCloseTo(1.4826, 4);
    expect(b.half).toBe(5); // max(2.5 x 1.48, 5)
    expect([b.low, b.high]).toEqual([52, 62]);
    expect(b.ready).toBe(true);
  });

  it("is not ready before 7 checks", () => {
    expect(computeBaseline("hr", [55, 56, 57, 58, 59, 60]).ready).toBe(false);
    expect(computeBaseline("hr", [55, 56, 57, 58, 59, 60, 61]).ready).toBe(true);
  });

  it("uses only the last 30 values", () => {
    const b = computeBaseline("hr", [...Array(40).fill(90), ...Array(30).fill(60)]);
    expect(b.median).toBe(60);
    expect(b.n).toBe(30);
  });

  it("EWMA moves the centre by alpha = 0.05 after green, never after yellow", () => {
    const b = computeBaseline("hr", ASHA_HR);
    const g = updateAfterGreen(b, 67);
    expect(g.center).toBeCloseTo(57.5, 6);
    expect(g.high - g.low).toBeCloseTo(10, 6);
    expect(nextBaseline(b, "hr", 74, { preflight: false, green: false })).toBe(b);
    expect(nextBaseline(b, "hr", 60, { preflight: true, green: false }).n).toBe(11);
  });
});

// --------------------------------------------------------- journey J3, Day 212
describe("journey J3: Asha, Day 212", () => {
  const history = [
    day("2026-11-13", { sleep: 5.4, hr: 66, mood: 3 }, true),
    day("2026-11-12", { sleep: 5.6, hr: 61, mood: 4 }, false),
  ];
  const res = completeCheck(
    input({ bp_sys: 118, bp_dia: 76, hr: 74, glucose: 92, temp: 36.8, sleep: 5.2, mood: 3 }),
    ctx({ history }),
  );
  const get = (i: Indicator) => res.results.find((r) => r.indicator === i)!;

  it("HR 74 is clinically green but yellow against her band, with a full why", () => {
    const hr = get("hr");
    expect(hr.status).toBe("yellow");
    const clinical = hr.why.find((w) => w.layer === "clinical")!;
    expect(clinical.text).toContain("inside the usual range");
    const personal = hr.why.find((w) => w.ruleId === "HR-P1")!;
    expect(personal).toMatchObject({ layer: "personal", value: 74, low: 52, high: 62 });
    expect(personal.source).toMatch(/personal baseline/i);
    expect(hr.band).toEqual({ low: 52, high: 62, position: "above" });
  });

  it("sleep is yellow with TR-SLEEP-3 (third short night)", () => {
    const s = get("sleep");
    expect(s.status).toBe("yellow");
    expect(s.why.map((w) => w.ruleId)).toContain("TR-SLEEP-3");
  });

  it("blood, skin and blood pressure stay green", () => {
    for (const i of ["glucose", "temp", "bp_sys", "bp_dia"] as Indicator[]) expect(get(i).status).toBe("green");
  });

  it("raises one PT-FATIGUE card and an overall yellow with an evening recheck", () => {
    expect(res.patterns.map((p) => p.id)).toEqual(["PT-FATIGUE"]);
    expect(res.patterns[0].regions).toEqual(["brain", "heart"]);
    expect(res.overall).toBe("yellow");
    expect(res.escalation).toBe("recheck");
    expect(res.rulesVersion).toBe(RULES.version);
  });

  it("TR-REPEAT: still yellow at the evening recheck suggests telling the CMO", () => {
    const again = completeCheck(
      input({ hr: 72, sleep: 5.2, mood: 3 }, { checkId: "c2", ts: "2026-11-14T19:00:00.000Z" }),
      ctx({ history, earlierToday: [res] }),
    );
    expect(again.escalation).toBe("tell-cmo");
    expect(again.escalationWhy.join(" ")).toContain("TR-REPEAT");
  });
});

// ------------------------------------------------------------ trend rules
describe("trend rules", () => {
  it("TR-SLEEP-3 needs three consecutive days", () => {
    const gap = [day("2026-11-12", { sleep: 5 }), day("2026-11-11", { sleep: 5 })]; // missing 11-13
    const r = evaluateReading("sleep", 5.5, { history: gap, date: "2026-11-14" });
    expect(r.why.map((w) => w.ruleId)).not.toContain("TR-SLEEP-3");
  });

  it("TR-SLEEP-RED: under 4 h two nights in a row is red", () => {
    const r = evaluateReading("sleep", 3.5, { history: [day("2026-11-13", { sleep: 3.0 })], date: "2026-11-14" });
    expect(r.status).toBe("red");
    expect(r.why.map((w) => w.ruleId)).toContain("TR-SLEEP-RED");
    const one = evaluateReading("sleep", 3.5, { history: [day("2026-11-13", { sleep: 6.0 })], date: "2026-11-14" });
    expect(one.status).toBe("yellow");
  });

  it("TR-MOOD-3: one point below usual three days running", () => {
    const h = [day("2026-11-13", { mood: 3 }), day("2026-11-12", { mood: 3 })];
    const r = evaluateReading("mood", 3, { baselines: ASHA_BASE, history: h, date: "2026-11-14" });
    expect(r.status).toBe("yellow");
    expect(r.why.map((w) => w.ruleId)).toContain("TR-MOOD-3");
  });

  it("TR-HR-3: above the band three days running", () => {
    const h = [day("2026-11-13", { hr: 64 }, true), day("2026-11-12", { hr: 65 }, true)];
    const r = evaluateReading("hr", 64, { baselines: ASHA_BASE, history: h, date: "2026-11-14" });
    expect(r.why.map((w) => w.ruleId)).toEqual(expect.arrayContaining(["HR-P1", "TR-HR-3"]));
  });

  it("toDayRecord keeps values and band positions for later days", () => {
    const c = completeCheck(input({ hr: 74, sleep: 7 }), ctx());
    const rec = toDayRecord(c);
    expect(rec.values).toEqual({ hr: 74, sleep: 7 });
    expect(rec.aboveBand.hr).toBe(true);
  });

  it("addDays crosses month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("normal for you, both ways (HR-P1-CLEAR)", () => {
  it("HR 55 is clinically low but green inside Asha's own 52-62 band", () => {
    const r = evaluateReading("hr", 55, { baselines: ASHA_BASE });
    expect(r.status).toBe("green");
    expect(r.why.map((w) => w.ruleId)).toEqual(["HR-C1", "HR-P1-CLEAR"]);
  });
  it("stays yellow without a ready band, or outside the band", () => {
    expect(evaluateReading("hr", 55).status).toBe("yellow");
    expect(evaluateReading("hr", 48, { baselines: ASHA_BASE }).status).toBe("yellow");
  });
  it("never applies to other indicators or to red flags", () => {
    const lowSugar = baselinesFrom({ glucose: [60, 62, 61, 63, 60, 62, 61] });
    expect(evaluateReading("glucose", 61, { baselines: lowSugar }).status).toBe("yellow");
    const lowHr = baselinesFrom({ hr: [38, 39, 40, 41, 39, 40, 38] });
    expect(evaluateReading("hr", 39, { baselines: lowHr }).status).toBe("red");
  });
});

// ----------------------------------------------------- context, symptoms, patterns
describe("context chips, symptoms and patterns", () => {
  it("after exercise skips the HR personal rule but not the red flag", () => {
    const skipped = evaluateReading("hr", 74, { baselines: ASHA_BASE, tags: ["exercise"] });
    expect(skipped.status).toBe("green");
    expect(skipped.why.some((w) => w.layer === "context")).toBe(true);
    const red = evaluateReading("hr", 140, { baselines: ASHA_BASE, tags: ["exercise"] });
    expect(red.status).toBe("red");
  });

  it("any symptom makes the check red and alerts the CMO and Earth", () => {
    const r = completeCheck(input({ hr: 58 }, { symptoms: ["chest_pain"] }), ctx());
    expect(r.overall).toBe("red");
    expect(r.patterns[0]).toMatchObject({ id: "SY-R1", regions: ["heart"] });
    expect(r.escalation).toBe("alert-cmo-and-earth");
  });

  it("PT-FEVER: temperature 38+ with HR above band tells the CMO", () => {
    const r = completeCheck(input({ temp: 38.3, hr: 70 }), ctx());
    expect(r.patterns.map((p) => p.id)).toContain("PT-FEVER");
    expect(r.escalation).toBe("tell-cmo");
  });

  it("unwell lowers the threshold for telling the CMO", () => {
    const r = completeCheck(input({ sleep: 6 }, { tags: ["unwell"] }), ctx());
    expect(r.escalation).toBe("tell-cmo");
  });

  it("a check with only impossible values has no colour and no escalation", () => {
    const r = completeCheck(input({ hr: 900 }), ctx());
    expect(r.overall).toBe("invalid");
    expect(r.escalation).toBe("none");
  });
});

// ----------------------------------------------------------- Earth link
describe("Earth link (JPL Horizons cache)", () => {
  it("Nov 14, 2026: 11.0 min one way (FR-43)", () => {
    expect(oneWayMin("2026-11-14")).toBeCloseTo(11.0, 1);
  });

  it("matches the PRD's checked extremes", () => {
    const s = series();
    const min = Math.min(...s.map((d) => d.oneWayMin));
    const max = Math.max(...s.map((d) => d.oneWayMin));
    expect(min).toBeCloseTo(5.4, 1);
    expect(max).toBeCloseTo(20.1, 1);
  });

  it("Sun blackout Mar 8 - Apr 3, 2028 (FR-44)", () => {
    expect(isBlackout("2028-03-07")).toBe(false);
    expect(isBlackout("2028-03-08")).toBe(true);
    expect(isBlackout("2028-03-20")).toBe(true);
    expect(isBlackout("2028-04-03")).toBe(true);
    expect(isBlackout("2028-04-04")).toBe(false);
    expect(blackoutEnd("2028-03-20")).toBe("2028-04-04");
  });

  it("red on 2026-11-14 queues for Earth, arriving 11 min later", () => {
    const r = completeCheck(input({ glucose: 48 }), ctx());
    expect(r.overall).toBe("red");
    expect(r.earthHeld).toBe(false);
    const mins = (Date.parse(r.earthEta!) - Date.parse(r.ts)) / 60_000;
    expect(mins).toBeCloseTo(11.0, 1);
  });

  it("red on 2028-03-20 is held for the Sun blackout", () => {
    const r = completeCheck(input({ glucose: 48 }, { date: "2028-03-20", ts: "2028-03-20T07:00:00Z" }), ctx({ earth: earthFor("2028-03-20") }));
    expect(r.earthHeld).toBe(true);
    expect(r.earthEta).toBeUndefined();
    expect(r.escalationWhy.join(" ")).toContain("2028-04-04");
  });
});

// ----------------------------------------------------------- Mars time
describe("Mars sol reminders (FR-61)", () => {
  it("next 07:00 is local morning on Mars and within one sol", () => {
    const now = Date.parse("2026-11-14T00:00:00Z");
    const t = nextLocalTime(now, 7);
    expect(localMarsHours(t)).toBeCloseTo(7, 3);
    expect(t - now).toBeGreaterThan(0);
    expect(t - now).toBeLessThanOrEqual(SOL_SECONDS * 1000);
    // the following morning is exactly one sol later
    expect(nextLocalTime(t + 1000, 7) - t).toBeCloseTo(SOL_SECONDS * 1000, -2);
  });
});

// ----------------------------------------------------------- performance
describe("performance (NFR-02)", () => {
  it("a full check evaluates in under 100 ms", () => {
    const history: DayRecord[] = Array.from({ length: 90 }, (_, k) =>
      day(addDays("2026-11-14", -(k + 1)), { sleep: 7, hr: 58, mood: 4 }));
    const t0 = performance.now();
    let last: CheckResult | undefined;
    for (let k = 0; k < 10; k++) {
      last = completeCheck(input({ bp_sys: 118, bp_dia: 76, hr: 74, glucose: 92, temp: 36.8, sleep: 5.2, mood: 3 }), ctx({ history }));
    }
    const per = (performance.now() - t0) / 10;
    expect(last).toBeDefined();
    expect(per).toBeLessThan(100);
  });
});

it("worst() never lets invalid beat a colour", () => {
  expect(worst("invalid", "green")).toBe("green");
  expect(worst("red", "invalid")).toBe("red");
  expect(matches(5, { gte: 5, lt: 6 })).toBe(true);
});
