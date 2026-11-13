// SIMULATED crew for Crew Pulse (PRD v3, Pillar B): the three other members of
// Asha Rao's Mars crew (all fictional), 7 sols of checks generated through the
// real engine, with two scripted events:
//   - a fever that moves from Kwame (today-4) to Mei (today-2)        -> CP-SPREAD
//   - headache / short sleep in Tomas and Mei today, with Asha's own  -> CP-CABIN
// Asha's rows come from the live vault, never from here.
import { computeBaseline } from "../engine/baseline";
import type { CrewDay } from "../engine/crewpulse";
import { recentDates, solsBetween } from "../engine/crewpulse";
import { addDays, completeCheck, toDayRecord } from "../engine/evaluate";
import { earthFor } from "../engine/horizons";
import type { Baselines, CheckInput, DayRecord, Indicator, Symptom } from "../engine/types";
import type { AppState } from "../storage/projection";

export interface CrewMember { crew: string; name: string; role: string }

export const OTHER_CREW: CrewMember[] = [
  { crew: "LIND-02", name: "Tomas Lindqvist", role: "Flight engineer" },
  { crew: "NAKA-03", name: "Mei Nakamura", role: "Science officer · CMO" },
  { crew: "MENS-04", name: "Kwame Mensah", role: "Pilot · geologist" },
];

/** Default cabin CO2 for the simulated habitat today, mmHg (scripted above the NASA limit). */
export const SIM_CABIN_CO2 = 3.4;

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

interface Persona { m: CrewMember; hr: number; sys: number; dia: number; sleep: number; temp: number; glucose: number }
const PERSONAS: Persona[] = [
  { m: OTHER_CREW[0], hr: 62, sys: 121, dia: 78, sleep: 7.2, temp: 36.6, glucose: 92 },
  { m: OTHER_CREW[1], hr: 58, sys: 112, dia: 72, sleep: 7.6, temp: 36.8, glucose: 88 },
  { m: OTHER_CREW[2], hr: 54, sys: 119, dia: 76, sleep: 7.0, temp: 36.7, glucose: 94 },
];

const INDS: Exclude<Indicator, "mood" | "crt">[] = ["bp_sys", "bp_dia", "hr", "glucose", "temp", "sleep"];

/** The other three crew members' last 7 sols, generated deterministically for `today` (mission day `day`). */
export function otherCrewDays(today: string, day: number): CrewDay[] {
  const out: CrewDay[] = [];
  const dates = recentDates(today, 7);
  PERSONAS.forEach((p, idx) => {
    const rnd = mulberry32(1000 + idx);
    const noise = (amp: number) => (rnd() * 2 - 1) * amp;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const half = (x: number) => Math.round(x * 2) / 2;
    // A learned "own normal" per indicator from 10 quiet values.
    let baselines: Baselines = {};
    for (const ind of INDS) {
      const c = { bp_sys: p.sys, bp_dia: p.dia, hr: p.hr, glucose: p.glucose, temp: p.temp, sleep: p.sleep }[ind];
      const amp = { bp_sys: 4, bp_dia: 3, hr: 3, glucose: 4, temp: 0.2, sleep: 0.6 }[ind];
      baselines = { ...baselines, [ind]: computeBaseline(ind, Array.from({ length: 10 }, () => Number((c + noise(amp)).toFixed(ind === "temp" || ind === "sleep" ? 1 : 0)))) };
    }
    baselines = { ...baselines, mood: computeBaseline("mood", [4, 4, 4, 5, 4, 4, 3, 4, 4, 4]) };
    const history: DayRecord[] = [];
    for (const date of dates) {
      const back = solsBetween(date, today); // 6..0
      const v: CheckInput["values"] = {
        bp_sys: Math.round(p.sys + noise(4)), bp_dia: Math.round(p.dia + noise(3)), hr: Math.round(p.hr + noise(3)),
        glucose: Math.round(p.glucose + noise(4)), temp: r1(p.temp + noise(0.2)), sleep: half(p.sleep + noise(0.6)), mood: rnd() < 0.2 ? 3 : 4,
      };
      const symptoms: Symptom[] = [];
      // Scripted: fever moves Kwame (today-4) -> Mei (today-2).
      if (p.m.crew === "MENS-04" && back === 4) { v.temp = 38.3; v.hr = p.hr + 14; }
      if (p.m.crew === "MENS-04" && back === 3) { v.temp = 37.8; v.hr = p.hr + 8; }
      if (p.m.crew === "NAKA-03" && back === 2) { v.temp = 38.1; v.hr = p.hr + 12; }
      if (p.m.crew === "NAKA-03" && back === 1) { v.temp = 37.6; }
      // Scripted: today, Tomas and Mei have the cabin complaint (headache, short sleep).
      if (p.m.crew === "LIND-02" && back === 0) { v.sleep = 5.5; symptoms.push("headache"); }
      if (p.m.crew === "NAKA-03" && back === 0) { v.sleep = 5.0; }
      const input: CheckInput = { checkId: `sim-${p.m.crew}-${date}`, ts: `${date}T07:05:00.000Z`, date, day: day - back, values: v, tags: [], symptoms };
      const r = completeCheck(input, { baselines, history, earlierToday: [], earth: earthFor(date, "mars") });
      history.push(toDayRecord(r));
      const values: CrewDay["values"] = {};
      for (const x of r.results) if (x.indicator !== "mood" && x.status !== "invalid") values[x.indicator as keyof CrewDay["values"]] = x.value;
      out.push({ crew: p.m.crew, name: p.m.name, date, day: day - back, overall: r.overall, values, symptoms, patterns: r.patterns.filter((q) => q.status !== "green").map((q) => q.id) });
    }
  });
  return out;
}

/** Asha's own rows from the live state (latest check per date), mood left out. */
export function ownCrewDays(state: AppState, today: string, day: number): CrewDay[] {
  const p = state.profile;
  if (!p) return [];
  const rows: CrewDay[] = [];
  for (const date of recentDates(today, 7)) {
    const c = state.checks.filter((x) => x.date === date).at(-1);
    if (!c) continue;
    const values: CrewDay["values"] = {};
    for (const r of c.results) if (r.indicator !== "mood" && r.status !== "invalid") values[r.indicator as keyof CrewDay["values"]] = r.value;
    rows.push({
      crew: p.crewId, name: p.name, date, day: day - solsBetween(date, today), overall: c.overall, values,
      symptoms: state.symptoms[c.checkId] ?? [], patterns: c.patterns.filter((q) => q.status !== "green").map((q) => q.id),
    });
  }
  return rows;
}

/** All four crew members, oldest sol first. */
export function crewDays(state: AppState, today: string, day: number): CrewDay[] {
  return [...ownCrewDays(state, today, day), ...otherCrewDays(today, day)].sort((a, b) => a.date.localeCompare(b.date));
}

export const CREW_ORDER = (state: AppState): CrewMember[] => [
  { crew: state.profile?.crewId ?? "YOU", name: state.profile?.name ?? "You", role: state.profile?.role ?? "" },
  ...OTHER_CREW,
];

export { addDays };
