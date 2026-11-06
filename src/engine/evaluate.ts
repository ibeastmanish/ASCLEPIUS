// The evaluation pipeline (PRD 7.3):
//   validity -> red flags -> clinical -> personal -> trend   (per reading)
//   then patterns -> overall -> escalation                     (per check)
// Pure functions: same inputs, same outputs. No I/O, no clocks.
import { escalate } from "./escalate";
import { RULES, describe, fmt, matches, worst, type Rules } from "./rules";
import type {
  Baselines,
  CheckInput,
  CheckResult,
  ContextTag,
  DayRecord,
  EngineContext,
  Indicator,
  IndicatorResult,
  PatternResult,
  Region,
  Status,
  Symptom,
  Why,
} from "./types";

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function unitOf(ind: Indicator, rules: Rules) {
  return rules.indicators[ind].unit;
}

function skippedBy(ind: Indicator, tags: ContextTag[], rules: Rules): ContextTag | undefined {
  return tags.find((t) => rules.context[t]?.skipPersonal.includes(ind));
}

/** Evaluate one reading through every per-reading layer. */
export function evaluateReading(
  ind: Indicator,
  value: number,
  opts: {
    tags?: ContextTag[];
    baselines?: Baselines;
    history?: DayRecord[];
    date?: string;
  } = {},
  rules: Rules = RULES,
): IndicatorResult {
  const r = rules.indicators[ind];
  const tags = opts.tags ?? [];
  const unit = unitOf(ind, rules);
  const sp = unit.startsWith("/") ? "" : " "; // "3/5" but "74 bpm"
  const v = fmt(ind, value, rules);
  const why: Why[] = [];

  // 1. Validity: impossible values are never coloured.
  if (!Number.isFinite(value) || !matches(value, r.valid)) {
    return {
      indicator: ind,
      value,
      status: "invalid",
      why: [{
        ruleId: r.valid.ruleId, layer: "validity", indicator: ind, value,
        low: r.valid.gte, high: r.valid.lte, source: "HYGIEA input check",
        text: `${Number.isFinite(value) ? v : "This"}${sp}${unit} can't be right. Please measure again.`,
      }],
    };
  }

  // 2. Red flags: immediately red; nothing can skip them.
  for (const rf of r.redflags) {
    if (matches(value, rf)) {
      const low = rf.lt !== undefined || rf.lte !== undefined;
      return {
        indicator: ind, value, status: "red", side: low ? "low" : "high",
        guidanceId: r.guidance.red,
        why: [{ ruleId: rf.ruleId, layer: "redflag", indicator: ind, value, source: rf.source,
          low: rf.gte ?? rf.gt, high: rf.lt ?? rf.lte, text: `${v}${sp}${unit}: ${rf.text}` }],
      };
    }
  }

  // 3. Clinical band: normal for most people.
  let status: Status = "green";
  let side: "low" | "high" | undefined;
  const g = r.clinical.green;
  const greenLow = g.gte ?? g.gt;
  const greenHigh = g.lte ?? g.lt;
  if (matches(value, g)) {
    why.push({ ruleId: r.clinical.ruleId, layer: "clinical", indicator: ind, value, low: greenLow, high: greenHigh,
      source: r.clinical.source, text: `${v}${sp}${unit} is inside the usual range for adults (${describe(g, unit)}).` });
  } else {
    status = "yellow";
    side = greenLow !== undefined && value < greenLow ? "low" : "high";
    why.push({ ruleId: r.clinical.ruleId, layer: "clinical", indicator: ind, value, low: greenLow, high: greenHigh,
      source: r.clinical.source,
      text: `${v}${sp}${unit} is ${side === "low" ? "below" : "above"} the usual range for adults (${describe(g, unit)}).` });
  }

  // 4. Personal band: normal for YOU.
  const b = opts.baselines?.[ind];
  const skip = skippedBy(ind, tags, rules);
  let band: IndicatorResult["band"];
  let learning: IndicatorResult["learning"];
  if (skip) {
    why.push({ ruleId: `CX-${skip.toUpperCase()}`, layer: "context", indicator: ind, value, source: "HYGIEA context rules",
      text: `Your personal band was not used: "${rules.context[skip].label}" changes this reading for about ${rules.context[skip].minutes} min.` });
  } else if (!b || !b.ready) {
    learning = { n: b?.n ?? 0, need: rules.baseline.learningChecks };
    why.push({ ruleId: r.personal.ruleId, layer: "personal", indicator: ind, value, source: "Personal baseline",
      text: `Still learning your normal (${learning.n} of ${learning.need} checks). Only the usual range is used for now.` });
  } else {
    const low = round(b.low, r.decimals);
    const high = round(b.high, r.decimals);
    // Compare against the band exactly as shown to the astronaut (rounded to the
    // indicator's precision), so "3" is inside a band displayed as "3-5".
    const position = value < low ? "below" : value > high ? "above" : "inside";
    band = { low, high, position };
    const dir = r.personal.direction;
    const flagged = (position === "below" && dir !== "high") || (position === "above" && dir !== "low");
    const bandTxt = `${fmt(ind, low, rules)}-${fmt(ind, high, rules)}${sp}${unit}`;
    if (flagged) {
      status = worst(status, "yellow");
      side = position === "below" ? "low" : "high";
      why.push({ ruleId: r.personal.ruleId, layer: "personal", indicator: ind, value, low, high,
        source: "Personal baseline (median ± 2.5 × MAD of your own checks)",
        text: `${v}${sp}${unit} is ${position} your normal (${bandTxt}), learned from your own checks.` });
    } else if (position === "inside" && status === "yellow" && side === "low" && r.personal.clearsClinicalLow) {
      // Normal for you, both ways: a mildly low value (never a red flag) that
      // sits inside your own learned band is green, e.g. an athlete's resting HR.
      status = "green";
      side = undefined;
      why.push({ ruleId: `${r.personal.ruleId}-CLEAR`, layer: "personal", indicator: ind, value, low, high,
        source: "Personal baseline; rules.json clearsClinicalLow (team decision [VERIFY])",
        text: `Below the usual adult range, but inside your own normal (${bandTxt}), so it's green for you.` });
    } else {
      why.push({ ruleId: r.personal.ruleId, layer: "personal", indicator: ind, value, low, high,
        source: "Personal baseline (median ± 2.5 × MAD of your own checks)",
        text: position === "inside" ? `Inside your normal (${bandTxt}).` : `${position === "above" ? "Above" : "Below"} your normal (${bandTxt}), which is fine for this one.` });
    }
  }

  // 5. Trend rules across days.
  if (opts.history && opts.date) {
    const t = trendFor(ind, value, opts.date, opts.history, b, !!skip, rules);
    for (const w of t) {
      why.push(w.why);
      status = worst(status, w.status);
      if (w.status !== "green") side = side ?? (ind === "hr" ? "high" : "low");
    }
  }

  const guidanceId = status === "green" ? r.guidance.green : status === "red" ? r.guidance.red : r.guidance.yellow;
  return { indicator: ind, value, status, why, guidanceId, side, band, learning };
}

function round(x: number, d: number) {
  const p = 10 ** d;
  return Math.round(x * p) / p;
}

function trendFor(
  ind: Indicator,
  value: number,
  date: string,
  history: DayRecord[],
  b: Baselines[Indicator],
  skipped: boolean,
  rules: Rules,
): { status: Status; why: Why }[] {
  const byDate = new Map(history.map((d) => [d.date, d]));
  const prev = (n: number) => byDate.get(addDays(date, -n));
  const out: { status: Status; why: Why }[] = [];
  const T = rules.trends;

  if (ind === "sleep") {
    const red = T["TR-SLEEP-RED"];
    const run = (lt: number, days: number) => {
      if (!(value < lt)) return false;
      for (let i = 1; i < days; i++) {
        const v = prev(i)?.values.sleep;
        if (v === undefined || !(v < lt)) return false;
      }
      return true;
    };
    if (run(red.lt, red.days)) {
      out.push({ status: "red", why: { ruleId: "TR-SLEEP-RED", layer: "trend", indicator: ind, value, high: red.lt,
        source: red.source, text: `Under ${red.lt} h of sleep ${red.days} nights in a row.` } });
    } else if (run(T["TR-SLEEP-3"].lt, T["TR-SLEEP-3"].days)) {
      const s = T["TR-SLEEP-3"];
      out.push({ status: "yellow", why: { ruleId: "TR-SLEEP-3", layer: "trend", indicator: ind, value, high: s.lt,
        source: s.source, text: `Under ${s.lt} h of sleep ${s.days} nights in a row.` } });
    }
  }

  if (ind === "mood" && b?.ready) {
    const s = T["TR-MOOD-3"];
    const limit = b.center - s.belowMedianBy;
    const low = (v: number | undefined) => v !== undefined && v <= limit + 1e-9;
    let ok = low(value);
    for (let i = 1; i < s.days && ok; i++) ok = low(prev(i)?.values.mood);
    if (ok) out.push({ status: "yellow", why: { ruleId: "TR-MOOD-3", layer: "trend", indicator: ind, value,
      high: round(limit, 1), source: s.source,
      text: `Mood at least ${s.belowMedianBy} point below your usual ${s.days} days in a row.` } });
  }

  if (ind === "hr" && b?.ready && !skipped) {
    const s = T["TR-HR-3"];
    let ok = value > b.high;
    for (let i = 1; i < s.days && ok; i++) ok = prev(i)?.aboveBand.hr === true;
    if (ok) out.push({ status: "yellow", why: { ruleId: "TR-HR-3", layer: "trend", indicator: ind, value,
      low: round(b.low, 0), high: round(b.high, 0), source: s.source,
      text: `Resting heart rate above your normal ${s.days} days in a row.` } });
  }
  return out;
}

// ---------------------------------------------------------------- per check

const SYMPTOM_REGION: Record<Symptom, Region> = {
  chest_pain: "heart", breathing: "heart", fainting: "brain",
  weakness: "brain", confusion: "brain", headache: "brain",
};

function symptomResult(symptoms: Symptom[], rules: Rules): PatternResult | null {
  if (symptoms.length === 0) return null;
  const s = rules.symptoms;
  const names = symptoms.map((x) => s.list[x].toLowerCase());
  return {
    id: s.ruleId,
    status: "red",
    indicators: [],
    regions: [...new Set(symptoms.map((x) => SYMPTOM_REGION[x]))],
    guidanceId: "symptoms-red",
    tellCmo: true,
    why: [{ ruleId: s.ruleId, layer: "redflag", source: s.source,
      text: `You reported: ${names.join(", ")}. This always needs help right away.` }],
  };
}

function matchPatterns(results: IndicatorResult[], baselines: Baselines, tags: ContextTag[], rules: Rules): PatternResult[] {
  const get = (i: Indicator) => results.find((r) => r.indicator === i && r.status !== "invalid");
  const out: PatternResult[] = [];
  const sleep = get("sleep");
  const hr = get("hr");
  const mood = get("mood");
  const temp = get("temp");

  const hrHigh = (r?: IndicatorResult) => {
    if (!r || skippedBy("hr", tags, rules)) return false;
    const b = baselines.hr;
    return b?.ready ? r.value > b.high : r.value > 100;
  };

  // PT-FATIGUE: sleep below band + HR above band + mood down, same day.
  if (sleep && hr && mood) {
    const bs = baselines.sleep;
    const bm = baselines.mood;
    const sleepLow = bs?.ready ? sleep.value < bs.low : sleep.value < 6;
    const moodDown = bm?.ready ? mood.value < bm.center - 0.5 : mood.value <= 2;
    if (sleepLow && hrHigh(hr) && moodDown) {
      const p = rules.patterns["PT-FATIGUE"];
      out.push({
        id: "PT-FATIGUE",
        status: worst(worst(worst("yellow", sleep.status), hr.status), mood.status),
        indicators: ["sleep", "hr", "mood"],
        regions: p.regions,
        guidanceId: p.guidance,
        tellCmo: p.tellCmo,
        why: [
          { ruleId: "PT-FATIGUE", layer: "pattern", indicator: "sleep", value: sleep.value, source: p.source,
            text: `Short sleep (${fmt("sleep", sleep.value, rules)} h, below your normal).` },
          { ruleId: "PT-FATIGUE", layer: "pattern", indicator: "hr", value: hr.value, source: p.source,
            text: `Raised resting heart rate (${hr.value} bpm, above your normal).` },
          { ruleId: "PT-FATIGUE", layer: "pattern", indicator: "mood", value: mood.value, source: p.source,
            text: `Mood lower than usual (${mood.value}/5).` },
        ],
      });
    }
  }

  // PT-FEVER: temp >= 38.0 + HR above band.
  if (temp && hr) {
    const p = rules.patterns["PT-FEVER"];
    if (temp.value >= p.feverGte && hrHigh(hr)) {
      out.push({
        id: "PT-FEVER",
        status: worst(worst("yellow", temp.status), hr.status),
        indicators: ["temp", "hr"],
        regions: p.regions,
        guidanceId: p.guidance,
        tellCmo: p.tellCmo,
        why: [
          { ruleId: "PT-FEVER", layer: "pattern", indicator: "temp", value: temp.value, source: p.source,
            text: `Raised temperature (${fmt("temp", temp.value, rules)} °C).` },
          { ruleId: "PT-FEVER", layer: "pattern", indicator: "hr", value: hr.value, source: p.source,
            text: `Heart rate up at the same time (${hr.value} bpm).` },
        ],
      });
    }
  }
  return out;
}

/** Evaluate a whole check: every reading, symptoms, patterns, overall, escalation. */
export function completeCheck(input: CheckInput, ctx: EngineContext, rules: Rules = RULES): CheckResult {
  const results: IndicatorResult[] = [];
  for (const ind of Object.keys(input.values) as Indicator[]) {
    const value = input.values[ind];
    if (value === undefined) continue;
    results.push(evaluateReading(ind, value, {
      tags: input.tags, baselines: ctx.baselines, history: ctx.history, date: input.date,
    }, rules));
  }

  const patterns = matchPatterns(results, ctx.baselines, input.tags, rules);
  const sym = symptomResult(input.symptoms, rules);
  if (sym) patterns.unshift(sym);

  let overall: Status = "invalid";
  for (const r of results) overall = worst(overall, r.status);
  for (const p of patterns) overall = worst(overall, p.status);
  // A check with only invalid readings has no colour; symptoms alone still make it red.

  const esc = escalate({ overall, results, patterns, tags: input.tags, earlierToday: ctx.earlierToday, earth: ctx.earth, now: input.ts }, rules);

  return {
    checkId: input.checkId,
    ts: input.ts,
    date: input.date,
    day: input.day,
    overall,
    results,
    patterns,
    escalation: esc.escalation,
    escalationWhy: esc.why,
    earthEta: esc.earthEta,
    earthHeld: esc.earthHeld,
    rulesVersion: rules.version,
  };
}

/** Summarise a check as the trend rules will see it on later days. */
export function toDayRecord(c: CheckResult): DayRecord {
  const rec: DayRecord = { date: c.date, day: c.day, values: {}, statuses: {}, aboveBand: {}, belowBand: {} };
  for (const r of c.results) {
    if (r.status === "invalid") continue;
    rec.values[r.indicator] = r.value;
    rec.statuses[r.indicator] = r.status;
    if (r.band) {
      rec.aboveBand[r.indicator] = r.band.position === "above";
      rec.belowBand[r.indicator] = r.band.position === "below";
    }
  }
  return rec;
}
