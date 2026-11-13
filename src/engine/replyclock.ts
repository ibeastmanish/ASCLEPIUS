// Earth Reply Clock (PRD v3, Pillar A).
// For a finding, compare WHEN THE CREW MUST ACT with WHEN EARTH'S ANSWER CAN
// ARRIVE, and from that set who decides: Earth guides, Earth is consulted, or
// the crew decides alone. Pure: same inputs, same outputs; no clocks, no I/O.
//
//   earliest reply = wait for contact (Mars side)
//                  + one-way light time        (JPL Horizons, real)
//                  + flight surgeon response   (depends on their shift)
//                  + one-way light time
//                  + wait for contact to receive (Mars side)
import { earthFor, formatDelay, HORIZONS_SOURCE, inRange } from "./horizons";
import { DEFAULT_BASE_LON_E, formatMarsTime, localMarsHours, SOL_SECONDS } from "./mars";
import { RULES, type Rules } from "./rules";
import type { CheckResult, MissionSetting } from "./types";

export type Autonomy = "earth-guided" | "earth-consulted" | "crew-decides";
export type Priority = "red" | "routine";

/** The link to whoever can help. For space: light time. For the Earth clinic mode: travel time. */
export interface Link {
  oneWayMin: number;
  blackout: boolean;
  blackoutEnd?: string;
  /** Where the delay comes from, shown on screen. */
  source: string;
  /** True when the date is outside the cached table and the nearest day was used. */
  estimated?: boolean;
  /** Words for the far end ("Earth", "the clinic"). */
  far?: string;
  /** Replaces the flight surgeon's shift (clinic mode): opening hours in UTC terms. */
  shift?: { startUtcHour: number; hours: number; label: string; responseMin: Record<Priority, { on: number; off: number }> };
}

export interface Step {
  label: string;
  min: number;
  source: string;
  assumed: boolean;
}

export interface ReplyClock {
  level: Autonomy;
  priority: Priority;
  actWithinMin: number;
  actBasis: string;
  /** Infinity while the link is blocked and no end is known. */
  earliestReplyMin: number;
  replyAt?: string;
  actBy: string;
  steps: Step[];
  blackout: boolean;
  blackoutEnd?: string;
  surgeonOnShiftAtArrival: boolean;
  marsLocal?: string;
  houstonLocal: string;
  sentence: string;
  far: string;
  estimated: boolean;
}

const MIN = 60_000;
const MARS_HOUR_MS = (SOL_SECONDS / 24) * 1000;

// ------------------------------------------------------------ small helpers

function utcHours(ms: number): number {
  return ((ms / 3_600_000) % 24 + 24) % 24;
}

type Shift = NonNullable<Link["shift"]>;

function shiftOf(rules: Rules, link?: Link): Shift {
  if (link?.shift) return link.shift;
  const s = rules.replyClock.surgeon;
  return { startUtcHour: s.shiftStartUtcHour, hours: s.shiftHours, label: `${s.label}. ${s.source}`, responseMin: s.responseMin };
}

export function surgeonOnShift(ms: number, rules: Rules = RULES, link?: Link): boolean {
  const s = shiftOf(rules, link);
  return (utcHours(ms) - s.startUtcHour + 24) % 24 < s.hours;
}

/** Minutes from `ms` until the next shift start (0 if on shift). */
export function minutesToShift(ms: number, rules: Rules = RULES, link?: Link): number {
  if (surgeonOnShift(ms, rules, link)) return 0;
  const s = shiftOf(rules, link);
  return ((s.startUtcHour - utcHours(ms) + 24) % 24) * 60;
}

export function surgeonResponseMin(priority: Priority, arrivalMs: number, rules: Rules = RULES, link?: Link): number {
  const r = shiftOf(rules, link).responseMin[priority];
  if (surgeonOnShift(arrivalMs, rules, link)) return r.on;
  return priority === "red" ? r.off : minutesToShift(arrivalMs, rules, link) + r.off;
}

/** Houston local clock time (fixed UTC-6, as labelled in rules). */
export function houstonTime(ms: number): string {
  const d = new Date(ms - 6 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Milliseconds until the Mars-side contact window is open (0 when continuous or open now). */
export function waitForContactMs(ms: number, mission: MissionSetting, lonE = DEFAULT_BASE_LON_E, rules: Rules = RULES): number {
  const c = rules.replyClock.contact;
  if (c.mode === "continuous" || mission !== "mars") return 0;
  const h = localMarsHours(ms, lonE);
  const into = (h - c.windowStartMarsHour + 24) % 24;
  if (into < c.windowHoursPerSol) return 0;
  return (24 - into) * MARS_HOUR_MS;
}

export function formatDuration(min: number): string {
  if (!Number.isFinite(min)) return "not until the blackout ends";
  if (min < 1) return formatDelay(min);
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min - h * 60);
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
  return `${(min / 1440).toFixed(1)} days`;
}

// ------------------------------------------------------------ act-by window

/** How soon this result must be acted on, and why. Null for green / no colour. */
export function actWindow(r: Pick<CheckResult, "overall" | "escalation" | "patterns">, rules: Rules = RULES): { min: number; basis: string; priority: Priority } | null {
  const a = rules.replyClock.actWithinMin;
  if (r.overall === "red") return { min: a.red, basis: "Red result: first-response window", priority: "red" };
  const pats = r.patterns.filter((p) => p.status !== "green" && a[p.id] !== undefined);
  if (pats.length) {
    const p = pats.reduce((x, y) => (a[y.id] < a[x.id] ? y : x));
    const label = rules.patterns[p.id as keyof Rules["patterns"]]?.label ?? p.id;
    return { min: a[p.id], basis: `${label}: recheck window`, priority: "routine" };
  }
  if (r.escalation === "tell-cmo") return { min: a["tell-cmo"], basis: "Tell the CMO: before tomorrow's check", priority: "routine" };
  if (r.escalation === "recheck") return { min: a.recheck, basis: "Recheck: before this evening's check", priority: "routine" };
  return null;
}

// ------------------------------------------------------------ the clock

export interface ClockInput {
  nowMs: number;
  link: Link;
  priority: Priority;
  actWithinMin: number;
  actBasis: string;
  mission: MissionSetting;
  baseLonE?: number;
}

export function computeReplyClock(i: ClockInput, rules: Rules = RULES): ReplyClock {
  const rc = rules.replyClock;
  const lon = i.baseLonE ?? DEFAULT_BASE_LON_E;
  const far = i.link.far ?? "Earth";
  const steps: Step[] = [];
  const actByMs = i.nowMs + i.actWithinMin * MIN;
  const marsLocal = i.mission === "mars" ? formatMarsTime(i.nowMs, lon) : undefined;
  const base = {
    priority: i.priority, actWithinMin: i.actWithinMin, actBasis: i.actBasis, actBy: new Date(actByMs).toISOString(),
    marsLocal, houstonLocal: houstonTime(i.nowMs), far, estimated: !!i.link.estimated,
    blackout: i.link.blackout, blackoutEnd: i.link.blackoutEnd,
  };

  // Start from now, or from the end of a blackout (the link is closed until then).
  let t = i.nowMs;
  if (i.link.blackout) {
    if (!i.link.blackoutEnd) {
      return { ...base, level: "crew-decides", earliestReplyMin: Infinity, steps, surgeonOnShiftAtArrival: false,
        sentence: `The Sun blocks the radio link. Your crew medical officer decides now; ${far} will review after the blackout.` };
    }
    const end = Date.parse(`${i.link.blackoutEnd}T00:00:00Z`);
    steps.push({ label: "Wait for the Sun blackout to end", min: Math.max(0, (end - t) / MIN), source: HORIZONS_SOURCE, assumed: false });
    t = Math.max(t, end);
  }

  const w1 = waitForContactMs(t, i.mission, lon, rules) / MIN;
  if (w1 > 0) steps.push({ label: "Wait for the next contact window", min: w1, source: rc.contact.source, assumed: true });
  t += w1 * MIN;

  steps.push({ label: i.link.shift ? `Travel to ${far}` : `Light time to ${far}`, min: i.link.oneWayMin, source: i.link.source, assumed: !!i.link.shift });
  t += i.link.oneWayMin * MIN;

  const onShift = surgeonOnShift(t, rules, i.link);
  const resp = surgeonResponseMin(i.priority, t, rules, i.link);
  const clinic = !!i.link.shift;
  steps.push({
    label: clinic
      ? (onShift ? "Doctor answers (clinic open)" : i.priority === "red" ? "Doctor is called at home (clinic closed)" : "Waits for the clinic to open")
      : (onShift ? "Flight surgeon answers (on shift)" : i.priority === "red" ? "On-call surgeon is paged (off shift)" : "Waits for the surgeon's next shift"),
    min: resp, source: shiftOf(rules, i.link).label, assumed: true,
  });
  t += resp * MIN;

  steps.push({ label: i.link.shift ? "Travel back" : "Light time back", min: i.link.oneWayMin, source: i.link.source, assumed: !!i.link.shift });
  t += i.link.oneWayMin * MIN;

  const w2 = waitForContactMs(t, i.mission, lon, rules) / MIN;
  if (w2 > 0) steps.push({ label: "Wait for a contact window to receive it", min: w2, source: rc.contact.source, assumed: true });
  t += w2 * MIN;

  const earliest = (t - i.nowMs) / MIN;
  const level: Autonomy = i.link.blackout || earliest >= i.actWithinMin ? "crew-decides"
    : earliest < i.actWithinMin * rc.levels.guidedBelowFraction ? "earth-guided" : "earth-consulted";

  const ans = formatDuration(earliest);
  const act = formatDuration(i.actWithinMin);
  const sentence =
    level === "earth-guided" ? `${cap(far)}'s answer can arrive in ${ans}, well before you must act (${act}). Follow the card; ${i.link.shift ? "the doctor" : "the flight surgeon"} will reply.`
    : level === "earth-consulted" ? `Start the steps now. ${cap(far)}'s answer can arrive in ${ans}, just inside your ${act} window.`
    : i.link.blackout ? `The Sun blocks the radio link until ${i.link.blackoutEnd}. ${far}'s earliest answer: ${ans}. Your crew medical officer decides now; ${far} will review.`
    : i.link.shift ? `${cap(far)}'s earliest answer: ${ans}. You must act within ${act}. Act on the card now; tell the doctor when you reach them.`
    : `${cap(far)}'s earliest answer: ${ans}. You must act within ${act}. Your crew medical officer decides now; ${far} will review.`;

  return { ...base, level, earliestReplyMin: earliest, replyAt: new Date(t).toISOString(), steps, surgeonOnShiftAtArrival: onShift, sentence };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Delay is delay" (PRD v3 S2): the far end is a clinic, the delay is travel time, the shift is clinic hours. */
export function clinicLink(c: { travelMin: number; openHour: number; closeHour: number; tzOffsetMin: number; name: string }): Link {
  const startUtcHour = (((c.openHour - c.tzOffsetMin / 60) % 24) + 24) % 24;
  const hours = ((c.closeHour - c.openHour) % 24 + 24) % 24 || 24;
  return {
    oneWayMin: c.travelMin, blackout: false, far: c.name || "the clinic",
    source: "Travel time to the nearest doctor, as set by the health worker (assumption)",
    shift: {
      startUtcHour, hours,
      label: `Clinic open ${String(c.openHour).padStart(2, "0")}:00-${String(c.closeHour).padStart(2, "0")}:00 local (assumption)`,
      responseMin: { red: { on: 10, off: 60 }, routine: { on: 30, off: 30 } },
    },
  };
}

/** The link in force: clinic mode when it is on, otherwise the light-time link for the mission. */
export function linkFor(date: string, mission: MissionSetting, clinic?: { on: boolean; travelMin: number; openHour: number; closeHour: number; tzOffsetMin: number; name: string }): Link {
  return clinic?.on ? clinicLink(clinic) : spaceLink(date, mission);
}

/** Light-time link for a mission and date, from the cached JPL Horizons table. */
export function spaceLink(date: string, mission: MissionSetting): Link {
  const e = earthFor(date, mission);
  return {
    oneWayMin: e.oneWayMin, blackout: e.blackout, blackoutEnd: e.blackoutEnd,
    source: mission === "mars" ? `${HORIZONS_SOURCE}, ${date}` : mission === "moon" ? "Earth-Moon light time, about 1.3 s" : "ISS: no meaningful delay",
    estimated: mission === "mars" && !inRange(date),
  };
}

/** The Reply Clock for a completed check, or null when there is nothing to act on. */
export function replyClockForCheck(r: Pick<CheckResult, "overall" | "escalation" | "patterns" | "ts" | "date">, mission: MissionSetting, baseLonE?: number, link?: Link, rules: Rules = RULES): ReplyClock | null {
  const w = actWindow(r, rules);
  if (!w) return null;
  return computeReplyClock({
    nowMs: Date.parse(r.ts), link: link ?? spaceLink(r.date, mission), priority: w.priority,
    actWithinMin: w.min, actBasis: w.basis, mission, baseLonE,
  }, rules);
}

/**
 * Mars-sol drift: the crew's morning check moves ~40 min later each day
 * against Houston. Returns how many sols until the morning check falls inside
 * the surgeon's shift again (0 = today), searching up to `maxSols`.
 */
export function solsUntilAlignedMorning(morningMs: number, maxSols = 60, rules: Rules = RULES): number | null {
  for (let k = 0; k <= maxSols; k++) if (surgeonOnShift(morningMs + k * SOL_SECONDS * 1000, rules)) return k;
  return null;
}
