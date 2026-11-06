import raw from "./guidance.json";
import type { Indicator, Region } from "../engine/types";

export interface Guidance {
  id: string;
  region: Region;
  title: string;
  what: string;
  hazard: keyof typeof raw.hazards;
  do_now: string[];
  recheck: string;
  escalate_if: string;
  why_this_check: string;
  source: string;
}

const entries = raw.entries as Record<string, Omit<Guidance, "id">>;

export const HAZARDS = raw.hazards;
export const MEASURE = raw.measure as Record<Indicator, string>;
export const GUIDANCE_VERSION = raw.version;

/** Look up guidance, preferring a side-specific entry (e.g. glucose-yellow-low). */
export function guidance(id: string | undefined, side?: "low" | "high"): Guidance | undefined {
  if (!id) return undefined;
  const candidates = [side && `${id}-${side}`, id, `${id}-high`, `${id}-low`].filter(Boolean) as string[];
  const key = candidates.find((k) => entries[k]) ?? id;
  const e = entries[key];
  return e ? { id: key, ...e } : undefined;
}

export function allGuidanceIds(): string[] {
  return Object.keys(entries);
}
