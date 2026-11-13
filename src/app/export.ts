// Export: plain JSON (FR-62) and HL7 FHIR R4 Observations with LOINC codes (FR-63).
import { RULES } from "../engine/rules";
import type { Indicator } from "../engine/types";
import type { HEvent, Profile } from "../storage/events";

// [VERIFY each code at loinc.org] - BUILD_GUIDE 19.4
const LOINC: Partial<Record<Indicator, { code: string; display: string; ucum: string }>> = {
  bp_sys: { code: "8480-6", display: "Systolic blood pressure", ucum: "mm[Hg]" },
  bp_dia: { code: "8462-4", display: "Diastolic blood pressure", ucum: "mm[Hg]" },
  hr: { code: "8867-4", display: "Heart rate", ucum: "/min" },
  temp: { code: "8310-5", display: "Body temperature", ucum: "Cel" },
  glucose: { code: "2339-0", display: "Glucose [Mass/volume] in Blood", ucum: "mg/dL" },
  sleep: { code: "93832-4", display: "Sleep duration", ucum: "h" },
};

export function download(name: string, data: unknown, type = "application/json") {
  const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toJsonExport(events: HEvent[], profile?: Profile) {
  return {
    app: "ASCLEPIUS",
    exportedAt: new Date().toISOString(),
    rulesVersion: RULES.version,
    simulated: !!profile?.simulated,
    note: "Decision support, not a medical device.",
    events,
  };
}

export function toFhirBundle(events: HEvent[], profile?: Profile) {
  const patientRef = `Patient/${profile?.crewId ?? "crew"}`;
  const entries: unknown[] = [{
    fullUrl: `urn:uuid:${profile?.crewId ?? "crew"}`,
    resource: { resourceType: "Patient", id: profile?.crewId ?? "crew", name: [{ text: profile?.name ?? "Crew member" }] },
  }];
  const statusOf = new Map<string, string>();
  for (const e of events) if (e.type === "CheckCompleted") for (const r of e.result.results) statusOf.set(`${e.result.checkId}:${r.indicator}`, r.status);
  for (const e of events) {
    if (e.type !== "ReadingRecorded") continue;
    const l = LOINC[e.indicator];
    const status = statusOf.get(`${e.checkId}:${e.indicator}`);
    entries.push({
      fullUrl: `urn:uuid:${e.id}`,
      resource: {
        resourceType: "Observation",
        id: e.id,
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: e.indicator === "mood" ? "survey" : "vital-signs" }] }],
        code: l
          ? { coding: [{ system: "http://loinc.org", code: l.code, display: l.display }], text: RULES.indicators[e.indicator].label }
          : { coding: [{ system: "urn:asclepius:indicator", code: e.indicator, display: "Self-rated mood (1-5)" }], text: "Mood" },
        subject: { reference: patientRef },
        effectiveDateTime: e.ts,
        valueQuantity: { value: e.value, unit: RULES.indicators[e.indicator].unit, system: "http://unitsofmeasure.org", code: l?.ucum ?? "{score}" },
        interpretation: status ? [{ text: `ASCLEPIUS ${status}` }] : undefined,
        note: profile?.simulated ? [{ text: "Simulated crew data" }] : undefined,
      },
    });
  }
  return { resourceType: "Bundle", type: "collection", timestamp: new Date().toISOString(), entry: entries };
}
