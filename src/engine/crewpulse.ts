// Crew Pulse: one, some, or all (PRD v3, Pillar B).
// Looks across the whole crew's recent checks and separates three different
// causes that look the same on one person's screen:
//   one person flagged              -> an individual problem
//   several crew, the SAME sol      -> suspect the cabin (CO2)
//   fever moving crew to crew       -> possible infection spreading
//   whole-crew short sleep, 3 sols  -> schedule / sleep debt
// Pure functions, deterministic, every verdict carries its rule and source.
import { addDays } from "./evaluate";
import type { Indicator, Status, Symptom } from "./types";

/** One crew member's latest check on one sol, as Crew Pulse sees it. Mood is never included. */
export interface CrewDay {
  crew: string;
  name: string;
  date: string;
  day: number;
  overall: Status | "none";
  values: Partial<Record<Exclude<Indicator, "mood">, number>>;
  symptoms: Symptom[];
  /** Pattern ids that fired (PT-FEVER, PT-FATIGUE, ...). */
  patterns: string[];
}

export type PulseId = "CP-NONE" | "CP-ONE" | "CP-CABIN" | "CP-SPREAD" | "CP-SLEEP";

export interface PulseFinding {
  id: PulseId;
  status: Status;
  title: string;
  text: string;
  /** Crew ids involved, in time order where that matters. */
  crews: string[];
  dates: string[];
  source: string;
  /** What the CMO should do first. */
  doNow: string[];
}

export interface PulseInput {
  days: CrewDay[];
  today: string;
  /** Cabin CO2, mmHg (1-hour average), if known. */
  cabinCo2?: number;
  /** Crew size, when some members have not checked today. */
  crewCount?: number;
}

/** Thresholds and their sources. Everything here is shown on screen with the finding. */
export const PULSE_RULES = {
  co2LimitMmHg: 3.0,
  co2Source: "NASA-STD-3001 Vol 2 Rev F [V2 6004]: cabin CO2 no more than 3 mmHg averaged over one hour; NASA OCHMO-TB-004: headaches reported at 2.8-4.5 mmHg; NASA HRP hazard: Hostile/Closed Environments",
  feverC: 38.0,
  spreadMinSols: 1,
  spreadMaxSols: 3,
  spreadSource: "Project-defined timing rule. NASA HRP: Risk of Altered Immune System Responses (spaceflight can awaken inactive viruses) and Risk of Host-Microorganism Interactions; Artemis II Immune Biomarkers study. Latent herpes viruses reactivate in 53% of Shuttle and 61% of ISS astronauts, mostly without symptoms (Rooney et al. 2019, PMC6374706)",
  shortSleepH: 6,
  sleepSols: 3,
  sleepSource: "NASA-STD-3001 Vol 1 Rev C [V1 6001]: an 8.5 h sleep period is planned; NASA HRP: Risk of Inadequate Sleep and Irregular Schedules; Artemis II study of crew well-being, activity and sleep",
  cabinSource: "Project-defined rule: the same complaint in two or more crew on the same sol points to something shared (air, water, schedule) before it points to each person",
} as const;

// ------------------------------------------------------------------ flags

/** "Cabin" complaints: headache, short sleep, or the fatigue pattern. */
export function cabinFlag(d: CrewDay): string | null {
  if (d.symptoms.includes("headache")) return "headache";
  if (d.patterns.includes("PT-FATIGUE")) return "fatigue";
  if (d.values.sleep !== undefined && d.values.sleep < PULSE_RULES.shortSleepH) return "short sleep";
  return null;
}

export function feverFlag(d: CrewDay): boolean {
  return d.patterns.includes("PT-FEVER") || (d.values.temp !== undefined && d.values.temp >= PULSE_RULES.feverC);
}

export function flagged(d: CrewDay): boolean {
  return d.overall === "yellow" || d.overall === "red";
}

function byDate(days: CrewDay[], date: string): CrewDay[] {
  return days.filter((d) => d.date === date);
}

function med(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ------------------------------------------------------------------ rules

export function pulse(input: PulseInput): PulseFinding[] {
  const { days, today } = input;
  const out: PulseFinding[] = [];
  const todayRows = byDate(days, today);

  // CP-CABIN: the same complaint in 2+ crew on the same sol (today).
  const cabin = todayRows.map((d) => ({ d, f: cabinFlag(d) })).filter((x) => x.f) as { d: CrewDay; f: string }[];
  if (cabin.length >= 2) {
    const co2 = input.cabinCo2;
    const high = co2 !== undefined && co2 > PULSE_RULES.co2LimitMmHg;
    const kinds = [...new Set(cabin.map((x) => x.f))].join(", ");
    out.push({
      id: "CP-CABIN",
      status: high ? "red" : "yellow",
      title: `${cabin.length} of ${input.crewCount ?? todayRows.length} crew, same sol: suspect the cabin, not the person`,
      text: `${cabin.map((x) => x.d.name.split(" ")[0]).join(", ")} logged ${kinds} today.`
        + ((input.crewCount ?? todayRows.length) > todayRows.length ? ` ${(input.crewCount ?? 0) - todayRows.length} crew member has not checked yet.` : "")
        + (co2 === undefined
          ? ` Cabin CO2 is not entered. Check it: NASA's limit is ${PULSE_RULES.co2LimitMmHg} mmHg (1-hour average).`
          : high
            ? ` Cabin CO2 is ${co2.toFixed(1)} mmHg, above NASA's ${PULSE_RULES.co2LimitMmHg} mmHg limit.`
            : ` Cabin CO2 is ${co2.toFixed(1)} mmHg, inside NASA's ${PULSE_RULES.co2LimitMmHg} mmHg limit, so look at water, schedule and noise next.`),
      crews: cabin.map((x) => x.d.crew),
      dates: [today],
      source: `${PULSE_RULES.cabinSource}. ${PULSE_RULES.co2Source}`,
      doNow: high
        ? ["Check the CO2 scrubber and air flow now.", "Move the crew to the best-ventilated module.", "Recheck everyone in 2 hours.", "Tell Earth in the digest."]
        : ["Read the cabin CO2 sensor and enter it here.", "Ask the crew about water, noise and the schedule.", "Recheck everyone this evening."],
    });
  }

  // CP-SPREAD: fever in crew A, then fever in a different crew B 1-3 sols later (within the window given).
  const fevers = days.filter(feverFlag).sort((a, b) => a.date.localeCompare(b.date));
  const chain: CrewDay[] = [];
  for (const f of fevers) {
    const prev = chain.at(-1);
    if (!prev) { chain.push(f); continue; }
    if (f.crew === prev.crew) continue;
    const gap = solsBetween(prev.date, f.date);
    if (gap >= PULSE_RULES.spreadMinSols && gap <= PULSE_RULES.spreadMaxSols) chain.push(f);
    else chain.splice(0, chain.length, f);
  }
  if (chain.length >= 2 && solsBetween(chain.at(-1)!.date, today) <= PULSE_RULES.spreadMaxSols) {
    const seq = chain.map((c) => `${c.name.split(" ")[0]} (Sol ${c.day})`).join(" → ");
    out.push({
      id: "CP-SPREAD",
      status: chain.length >= 3 ? "red" : "yellow",
      title: "Fever moving from one crew member to the next: possible infection",
      text: `${seq}. Each new fever came ${PULSE_RULES.spreadMinSols}-${PULSE_RULES.spreadMaxSols} sols after the last. In a closed habitat that pattern is a crew problem, not one person's.`,
      crews: chain.map((c) => c.crew),
      dates: chain.map((c) => c.date),
      source: PULSE_RULES.spreadSource,
      doNow: ["Separate sleeping areas and wear masks in shared modules.", "Everyone measures temperature twice a day for 5 sols.", "Tell Earth now (digest or alert): the flight surgeon may want cultures or antivirals from the kit."],
    });
  }

  // CP-SLEEP: crew-median sleep under 6 h for 3 sols running.
  const sleepSols: string[] = [];
  for (let k = 0; k < PULSE_RULES.sleepSols; k++) {
    const date = addDays(today, -k);
    const hs = byDate(days, date).map((d) => d.values.sleep).filter((x): x is number => x !== undefined);
    if (hs.length >= 2 && med(hs) < PULSE_RULES.shortSleepH) sleepSols.push(date);
    else break;
  }
  if (sleepSols.length >= PULSE_RULES.sleepSols) {
    out.push({
      id: "CP-SLEEP",
      status: "yellow",
      title: "Whole-crew sleep debt",
      text: `The crew's median sleep has been under ${PULSE_RULES.shortSleepH} h for ${sleepSols.length} sols. That is a schedule problem before it is anyone's health problem.`,
      crews: [...new Set(byDate(days, today).map((d) => d.crew))],
      dates: [...sleepSols].reverse(),
      source: PULSE_RULES.sleepSource,
      doNow: ["Review the timeline with Earth: protect an 8.5 h sleep period.", "No critical tasks in the 01:00-07:00 circadian low.", "Dim lights an hour before the sleep period."],
    });
  }

  // CP-ONE / CP-NONE: only when nothing shared explains today.
  const flaggedToday = todayRows.filter(flagged);
  if (out.length === 0) {
    if (flaggedToday.length === 1) {
      const d = flaggedToday[0];
      out.push({
        id: "CP-ONE",
        status: d.overall as Status,
        title: `One crew member flagged: ${d.name}`,
        text: "No one else shows the same thing today, so follow that person's own card. Nothing points to the cabin or to an infection.",
        crews: [d.crew],
        dates: [today],
        source: "Project-defined: a flag in one person with no shared pattern is treated as individual",
        doNow: [`Open ${d.name.split(" ")[0]}'s body map and follow the card.`, "Recheck as the card says."],
      });
    } else if (flaggedToday.length === 0) {
      out.push({
        id: "CP-NONE",
        status: "green",
        title: "Crew is green today",
        text: todayRows.length ? "Every crew member who has checked today is inside their usual and their own normal." : "No checks yet today.",
        crews: [], dates: [today],
        source: "—",
        doNow: [],
      });
    } else {
      out.push({
        id: "CP-ONE",
        status: "yellow",
        title: `${flaggedToday.length} crew flagged today for different reasons`,
        text: `${flaggedToday.map((d) => d.name.split(" ")[0]).join(" and ")} are yellow or red, but not for the same thing, so treat each on their own card.`,
        crews: flaggedToday.map((d) => d.crew),
        dates: [today],
        source: "Project-defined",
        doNow: ["Open each body map and follow its card."],
      });
    }
  }
  return out;
}

export function solsBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The last `n` sols ending today, oldest first. */
export function recentDates(today: string, n = 7): string[] {
  return Array.from({ length: n }, (_, k) => addDays(today, k - (n - 1)));
}
