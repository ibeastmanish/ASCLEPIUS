// SIMULATED persona: Commander Asha Rao (fictional), Mars base.
// 14 pre-flight checks + 211 flight days, generated through the real engine,
// so that "today" is Day 212 and reproduces Journey J3 (PRD section 4).
// Deterministic: same `today` -> same data.
import { completeCheck } from "../engine/evaluate";
import { addDays } from "../engine/evaluate";
import { earthFor } from "../engine/horizons";
import type { Baselines, CheckInput, CheckResult, ContextTag, DayRecord, Indicator } from "../engine/types";
import { toDayRecord } from "../engine/evaluate";
import { checkEvents } from "../app/record";
import type { HEvent, Profile } from "../storage/events";

export const ASHA_DAY = 212;

/** Today's J3 values (entered by Asha in the demo). */
export const ASHA_TODAY: Partial<Record<Indicator, number>> = {
  bp_sys: 118, bp_dia: 76, hr: 74, glucose: 92, temp: 36.8, sleep: 5.2, mood: 3,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRE_HR = [55, 57, 58, 56, 59, 57, 54, 60, 57, 58, 56, 58, 57, 55];

export function ashaProfile(today: string): Profile {
  return {
    crewId: "ASHA-01",
    name: "Asha Rao",
    role: "Commander",
    mission: "mars",
    launchDate: addDays(today, -(ASHA_DAY - 1)),
    baseLonE: 137.4,
    simulated: true,
  };
}

function at(date: string, minutes: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 7, minutes).toISOString();
}

/** Every event for Asha's history up to (not including) `today`. */
export function ashaEvents(today: string): HEvent[] {
  const rnd = mulberry32(212);
  const noise = (amp: number) => (rnd() * 2 - 1) * amp;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const half = (x: number) => Math.round(x * 2) / 2;

  const profile = ashaProfile(today);
  const events: HEvent[] = [{ type: "ProfileSet", ts: at(addDays(profile.launchDate, -15), 0), profile }];
  let baselines: Baselines = {};
  const history: DayRecord[] = [];

  const run = (date: string, day: number, values: CheckInput["values"], tags: ContextTag[] = []) => {
    const input: CheckInput = {
      checkId: `seed-${date}`, ts: at(date, Math.floor(rnd() * 20)), date, day, values, tags, symptoms: [],
    };
    const result: CheckResult = completeCheck(input, {
      baselines, history, earlierToday: [], earth: earthFor(date, profile.mission),
    });
    const out = checkEvents(profile, baselines, input, result, "seed");
    events.push(...out.events);
    baselines = out.baselines;
    history.push(toDayRecord(result));
  };

  // 14 pre-flight days: learning "your normal".
  for (let k = 0; k < 14; k++) {
    const date = addDays(profile.launchDate, k - 14);
    run(date, k - 13, {
      bp_sys: Math.round(116 + noise(3)), bp_dia: Math.round(75 + noise(2)), hr: PRE_HR[k],
      glucose: Math.round(90 + noise(3)), temp: r1(36.7 + noise(0.15)),
      sleep: half(7.5 + noise(0.6)), mood: rnd() < 0.15 ? 5 : rnd() < 0.1 ? 3 : 4,
    });
  }

  // Flight days 1..211.
  for (let day = 1; day < ASHA_DAY; day++) {
    const date = addDays(profile.launchDate, day - 1);
    const v: CheckInput["values"] = {
      bp_sys: Math.round(117 + noise(4)), bp_dia: Math.round(75 + noise(3)),
      hr: Math.round(56.6 + noise(3)), glucose: Math.round(90 + noise(4)), temp: r1(36.7 + noise(0.2)),
      sleep: half(7.4 + noise(0.7)), mood: rnd() < 0.15 ? 5 : rnd() < 0.12 ? 3 : 4,
    };
    let tags: ContextTag[] = [];
    // First weeks: body clock adapting, a few short nights.
    if (day <= 10) v.sleep = half(6.6 + noise(0.6));
    // Day 87: one high fasting sugar, back to normal the next day.
    if (day === 87) v.glucose = 104;
    // Day 140: checked after a workout - HR personal rule skipped.
    if (day === 140) { v.hr = 82; tags = ["exercise"]; }
    // Lead-up to Day 212: sleep falls, heart rate drifts up, mood dips.
    if (day >= 205) v.hr = [58, 59, 60, 60, 61, 61, 66][day - 205];
    if (day === 209) v.sleep = 7.0;
    if (day === 210) { v.sleep = 5.6; v.mood = 4; }
    if (day === 211) { v.sleep = 5.4; v.mood = 4; }
    run(date, day, v, tags);
  }
  // Weekly eye checks (SANS) on the last four Sundays-ish: clear grid, contrast at step 6.
  for (const back of [28, 21, 14, 7]) {
    const date = addDays(today, -back);
    events.push({ type: "EyeCheckRecorded", ts: at(date, 30), check: {
      id: `seed-eyes-${date}`, ts: at(date, 30), date,
      tests: [{ eye: "left", amslerCells: [], contrastStep: back === 14 ? 5 : 6 }, { eye: "right", amslerCells: [], contrastStep: 6 }],
    } });
  }
  return events;
}
