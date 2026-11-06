// Earth link timing from the cached NASA JPL Horizons table (offline).
import data from "../data/horizons_delay.json";
import type { MissionSetting } from "./types";

interface HorizonsTable { source: string; start: string; blackoutBelowDeg: number; days: [number, number][] }
const H = data as unknown as HorizonsTable;

const DAY_MS = 86_400_000;
const startMs = Date.parse(`${H.start}T00:00:00Z`);

function index(date: string): number {
  const i = Math.round((Date.parse(`${date}T00:00:00Z`) - startMs) / DAY_MS);
  return Math.min(Math.max(i, 0), H.days.length - 1);
}
function dateAt(i: number): string {
  return new Date(startMs + i * DAY_MS).toISOString().slice(0, 10);
}

export const HORIZONS_SOURCE = H.source;
export const HORIZONS_RANGE = { start: H.start, end: dateAt(H.days.length - 1) };

export function inRange(date: string): boolean {
  return date >= HORIZONS_RANGE.start && date <= HORIZONS_RANGE.end;
}

/** One-way light time in minutes for a date (clamped to the table's range). */
export function oneWayMin(date: string, mission: MissionSetting = "mars"): number {
  if (mission === "iss") return 0;
  if (mission === "moon") return 1.3 / 60; // ~1.3 s
  return H.days[index(date)][0];
}

export function sunAngleDeg(date: string): number {
  return H.days[index(date)][1];
}

/** Solar-conjunction blackout: Sun-Earth-Mars angle under 3 degrees (project-defined proxy). */
export function isBlackout(date: string, mission: MissionSetting = "mars"): boolean {
  return mission === "mars" && inRange(date) && sunAngleDeg(date) < H.blackoutBelowDeg;
}

/** First date after `date` when the blackout is over. */
export function blackoutEnd(date: string): string | undefined {
  if (!isBlackout(date)) return undefined;
  let i = index(date);
  while (i < H.days.length && H.days[i][1] < H.blackoutBelowDeg) i++;
  return dateAt(i);
}

/** Every day in the table, for charts. */
export function series(): { date: string; oneWayMin: number; sunAngleDeg: number }[] {
  return H.days.map(([m, a], i) => ({ date: dateAt(i), oneWayMin: m, sunAngleDeg: a }));
}

export function earthFor(date: string, mission: MissionSetting = "mars") {
  const blackout = isBlackout(date, mission);
  return { oneWayMin: oneWayMin(date, mission), blackout, blackoutEnd: blackout ? blackoutEnd(date) : undefined };
}

export function formatDelay(min: number): string {
  if (min === 0) return "no delay";
  if (min < 1) return `${(min * 60).toFixed(1)} s`;
  return `${min.toFixed(1)} min`;
}
