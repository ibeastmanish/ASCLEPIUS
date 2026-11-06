// Turning a completed check into events: readings, tags, symptoms, result,
// baseline updates, CMO alert and Earth outbox messages.
import { nextBaseline } from "../engine/baseline";
import * as engine from "../engine/client";
import { earthFor } from "../engine/horizons";
import { RULES } from "../engine/rules";
import type { Baselines, CheckInput, CheckResult, ContextTag, Indicator, Symptom } from "../engine/types";
import type { KeyRing } from "../storage/crypto";
import { seal } from "../storage/earthlink";
import type { HEvent, OutboxMessage, Profile } from "../storage/events";
import { checksOn, historyBefore, type AppState } from "../storage/projection";
import { newId } from "./clock";

export interface Draft {
  values: Partial<Record<Indicator, number>>;
  tags: ContextTag[];
  symptoms: Symptom[];
  input?: "typed" | "tapped" | "seed";
}

/** Events that describe the check itself (no crypto; used by live checks and the seed). */
export function checkEvents(profile: Profile, baselines: Baselines, input: CheckInput, result: CheckResult, method: Draft["input"] = "tapped"): { events: HEvent[]; baselines: Baselines } {
  const ts = input.ts;
  const events: HEvent[] = [];
  for (const r of result.results) {
    events.push({
      type: "ReadingRecorded", ts, id: newId("r"), checkId: input.checkId, crewId: profile.crewId, date: input.date, day: input.day,
      indicator: r.indicator, value: r.value, unit: RULES.indicators[r.indicator].unit, input: method ?? "tapped",
    });
  }
  if (input.tags.length) events.push({ type: "ContextTagged", ts, checkId: input.checkId, tags: input.tags });
  if (input.symptoms.length) events.push({ type: "SymptomsReported", ts, checkId: input.checkId, symptoms: input.symptoms });
  events.push({ type: "CheckCompleted", ts, result });

  const next: Baselines = { ...baselines };
  const preflight = input.date < profile.launchDate;
  for (const r of result.results) {
    if (r.status === "invalid") continue;
    // Context-skipped readings (e.g. HR after exercise) don't teach the baseline.
    if (r.why.some((w) => w.layer === "context")) continue;
    const before = next[r.indicator];
    const after = nextBaseline(before, r.indicator, r.value, { preflight, green: r.status === "green" });
    if (after !== before) {
      next[r.indicator] = after;
      events.push({ type: "BaselineUpdated", ts, checkId: input.checkId, baseline: after });
    }
  }
  return { events, baselines: next };
}

function summary(profile: Profile, result: CheckResult, kind: OutboxMessage["kind"], symptoms: Symptom[]) {
  const readings: Record<string, [number, string]> = {};
  for (const r of result.results) readings[r.indicator] = [r.value, r.status];
  return {
    kind,
    crew: profile.crewId,
    name: profile.name,
    date: result.date,
    day: result.day,
    overall: result.overall,
    escalation: result.escalation,
    readings,
    patterns: result.patterns.map((p) => p.id),
    symptoms,
    rules: result.results.flatMap((r) => r.why.filter((w) => r.status !== "green" && w.layer !== "clinical").map((w) => w.ruleId)),
    rulesVersion: result.rulesVersion,
    simulated: !!profile.simulated,
  };
}

async function message(profile: Profile, result: CheckResult, kind: OutboxMessage["kind"], symptoms: Symptom[], ring: KeyRing): Promise<OutboxMessage> {
  const earth = earthFor(result.date, profile.mission);
  const sum = summary(profile, result, kind, symptoms);
  const sealed = await seal(sum, ring);
  return {
    id: newId(kind === "red-alert" ? "alert" : "digest"),
    kind,
    priority: kind === "red-alert" ? 0 : 1,
    checkId: result.checkId,
    createdAt: result.ts,
    date: result.date,
    eta: earth.blackout ? undefined : new Date(Date.parse(result.ts) + earth.oneWayMin * 60_000).toISOString(),
    held: earth.blackout,
    heldUntil: earth.blackoutEnd,
    oneWayMin: earth.oneWayMin,
    summary: sum,
    ...sealed,
  };
}

/** Run a live check through the engine worker and build every event for it. */
export async function runCheck(state: AppState, draft: Draft, now: Date, date: string, day: number, ring: KeyRing): Promise<{ result: CheckResult; events: HEvent[] }> {
  const profile = state.profile!;
  const input: CheckInput = {
    checkId: newId("check"), ts: now.toISOString(), date, day,
    values: draft.values, tags: draft.tags, symptoms: draft.symptoms,
  };
  const result = await engine.completeCheck(input, {
    baselines: state.baselines,
    history: historyBefore(state, date),
    earlierToday: checksOn(state, date),
    earth: earthFor(date, profile.mission),
  });
  const { events } = checkEvents(profile, state.baselines, input, result, draft.input);

  if (result.overall === "red") {
    events.push({ type: "CmoAlerted", ts: input.ts, checkId: input.checkId, reason: result.escalationWhy[0] ?? "Red result" });
    events.push({ type: "MessageQueued", ts: input.ts, message: await message(profile, result, "red-alert", draft.symptoms, ring) });
  }
  // One compact Earth digest per day (FR-45), from the first completed check.
  if (result.overall !== "invalid" && !state.outbox.some((m) => m.kind === "digest" && m.date === date)) {
    events.push({ type: "MessageQueued", ts: input.ts, message: await message(profile, result, "digest", draft.symptoms, ring) });
  }
  return { result, events };
}
