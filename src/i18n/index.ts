// Daily-check translations (PRD v3 section 6.4, S2). No library: one English
// table, one Telugu JSON, and a lookup with English fallback. Only the daily
// check is translated; every other screen stays in English. Numbers, units
// (mmHg, bpm, mg/dL, °C, h) and rule IDs never go through here.
import te from "./te.json";

export type Lang = "en" | "te";

/**
 * English source strings. The keys are what Check.tsx asks for; the test in
 * i18n.test.ts checks that te.json has every one of them. `{name}` is a
 * placeholder filled by t(key, lang, vars).
 */
export const EN = {
  "screen.title": "Daily check",
  "screen.about_one_minute": "About one minute",
  "screen.your_normal": "Your normal:",
  "screen.learning": "Learning your normal: {n} of {need}",
  "screen.not_due_today": "Not due today",
  "screen.resting_note": "Steady and in your normal for 7 days: asked every 2-3 days to save crew time.",
  "screen.add_tile": "Add {tile}",
  "screen.how_to_measure": "How to measure {tile}",
  "screen.finish": "Finish check",
  "screen.finish_alert": "Finish and alert the CMO",
  "screen.finish_alert_note": "Finishing the check alerts the crew medical officer now.",
  "screen.fix_first": "Fix the value marked \"Re-measure\" first.",
  "screen.saving": "Saving…",
  "screen.indicators": "{n} indicators",
  "screen.note_one": "1 note",
  "screen.notes": "{n} notes",
  "screen.no_notes": "no notes",
  "screen.nothing_leaves": "nothing leaves this device",
  "screen.draft_badge": "Draft translation · needs native review",
  "tiles.bp": "Blood pressure",
  "tiles.bp_sys": "Systolic (top)",
  "tiles.bp_dia": "Diastolic (bottom)",
  "tiles.hr": "Heart rate",
  "tiles.glucose": "Blood sugar",
  "tiles.temp": "Temperature",
  "tiles.sleep": "Sleep",
  "tiles.sleep_unit": "h",
  "tiles.mood": "Mood",
  "tiles.mood_scale": "Mood, 1 to 5",
  "mood_words.0": "Very low",
  "mood_words.1": "Low",
  "mood_words.2": "Okay",
  "mood_words.3": "Good",
  "mood_words.4": "Great",
  "status.green": "Good",
  "status.yellow": "Check",
  "status.red": "Act now",
  "status.invalid": "Re-measure",
  "status.none": "Not checked",
  "context.heading": "Context",
  "context.question": "Anything to note?",
  "context.exercise": "After exercise",
  "context.eva": "After EVA",
  "context.caffeine": "Caffeine",
  "context.meal": "After a meal",
  "context.medication": "Medication",
  "context.woke": "Just woke up",
  "context.unwell": "Unwell",
  "context.dizzy": "Dizzy when standing",
  "context.paused_note": "Some personal-band rules are paused for this reading. Red flags are never paused.",
  "symptoms.heading": "Warning signs",
  "symptoms.question": "Any of these right now?",
  "symptoms.rule": "Any warning sign is red.",
  "symptoms.chest_pain": "Chest pain",
  "symptoms.breathing": "Trouble breathing",
  "symptoms.fainting": "Fainting",
  "symptoms.weakness": "Sudden weakness or numbness",
  "symptoms.confusion": "Confusion",
  "symptoms.headache": "Severe headache",
  "perfusion.optional": "Optional",
  "perfusion.title": "Perfusion check",
  "perfusion.tag": "· optional, experimental",
  "perfusion.intro": "A camera-based perfusion self-test. Not one of the six required readings; try it when you have a minute.",
  "perfusion.add": "Add perfusion check (camera)",
} as const satisfies Record<string, string>;

export type Key = keyof typeof EN;
/** Every key the daily check can request, for tests. */
export const CHECK_KEYS = Object.keys(EN) as Key[];

export type Dict = Partial<Record<Key, string>>;
export type Vars = Record<string, string | number>;

/** Flatten nested JSON ({ screen: { title } }, arrays included) into "screen.title" keys. `_meta` is skipped. */
export function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj === null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === "_meta") continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") Object.assign(out, flatten(v, key));
  }
  return out;
}

export const TE: Dict = flatten(te) as Dict;
export const TE_META = te._meta;

function fill(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Build a translator over the given dictionaries. English is the fallback for any missing key. */
export function makeT(dicts: Partial<Record<Lang, Dict>>) {
  return (key: Key, lang: Lang | undefined, vars?: Vars): string => {
    const d = lang && lang !== "en" ? dicts[lang] : undefined;
    return fill(d?.[key] ?? EN[key] ?? key, vars);
  };
}

export const t = makeT({ te: TE });

/** Languages offered in Settings. Telugu is a draft until the _meta.reviewedBy field names a reviewer. */
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "te", label: `తెలుగు (Telugu, ${TE_META.reviewedBy ? "reviewed" : "draft"})` },
];

/** "Delay is delay" Earth mode (PRD v3 6.4): defaults for the rural clinic Reply Clock. */
export const CLINIC_DEFAULTS = {
  on: false,
  name: "the PHC doctor",
  travelMin: 180,
  openHour: 9,
  closeHour: 17,
  tzOffsetMin: 330,
} as const;

/** 330 -> "+05:30", -360 -> "-06:00". */
export function fmtTz(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(Math.round(min));
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
