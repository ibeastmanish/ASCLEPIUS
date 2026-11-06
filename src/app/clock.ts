// Mission clock: real time, or a date override for demos (blackout, video).
import type { Profile, Settings } from "../storage/events";

export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Current mission-clock instant: today's time of day on the override date, if set. */
export function missionNow(settings: Settings, real = new Date()): Date {
  if (!settings.dateOverride) return real;
  const [y, m, d] = settings.dateOverride.split("-").map(Number);
  const out = new Date(real);
  out.setFullYear(y, m - 1, d);
  return out;
}

export function missionToday(settings: Settings, real = new Date()): string {
  return settings.dateOverride || localDate(real);
}

/** Mission day: 1 = launch day, 0 and below = pre-flight. */
export function missionDay(profile: Profile | undefined, date: string): number {
  if (!profile) return 0;
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${profile.launchDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function dayLabel(day: number): string {
  return day >= 1 ? `Day ${day}` : `Pre-flight L${day - 1}`;
}

/** Clock time in UTC, the one time zone every message timeline uses ("06:41 UTC"). */
export function utcHM(t: string | number | Date): string {
  return new Date(t).toISOString().slice(11, 16) + " UTC";
}

export function fmtDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function newId(prefix: string): string {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${Array.from(r, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
