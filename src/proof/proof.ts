// Typed view of src/data/i4_proof.json, written by `npm run proof`
// (analysis/i4_proof.py, then scripts/proof.mjs for the "engine" section).
import raw from "../data/i4_proof.json";

export interface McvPoint { timepoint: string; day: number; value: number }
export interface McvCrew {
  crew: string;
  series: McvPoint[];
  preMin: number;
  preMax: number;
  preMedian: number;
  r1: number;
  r1BelowOwnMin: boolean;
  r1InsidePopulation: boolean;
  r1MinusOwnMin: number;
  r194: number | null;
  r194BelowOwnMin: boolean | null;
}
export interface IiRow { analyte: string; label: string; panel: "CBC" | "CMP"; unit: string; cvI: number; cvG: number; ii: number; iiAnova: number | null }
export interface EngineCrew {
  crew: string; preflight: number[]; median: number; spread: number; half: number; low: number; high: number;
  ready: boolean; r1: number; preflightOutsideBand: number; r1OutsideBand: boolean; r1BelowBand: boolean;
}
export interface Proof {
  schema: number;
  title: string;
  headline: string;
  claimStrength: string;
  sources: { id: string; panel: string; file: string; title: string; url: string; download: string }[];
  crew: number;
  timepoints: { timepoint: string; day: number }[];
  fix: {
    row: string; file: string; summary: string; detectedBy: string; note: string; mcvAffected: boolean;
    moves: { column: string; raw: number | null; corrected: number; takenFrom: string }[];
    reconstructed: { column: string; value: number; how: string }[];
    checksBefore: { check: string; ok: boolean | null; detail: string }[];
    checksAfter: { check: string; ok: boolean | null; detail: string }[];
  };
  mcv: {
    analyte: string; label: string; unit: string;
    population: { low: number; high: number; source: string };
    personalRule: string;
    crew: McvCrew[];
    result: { n: number; belowOwnMinAtR1: number; insidePopulationAtR1: number; stillBelowOwnMinAtR194: number; r194Available: number };
    caption: string;
  };
  ii: {
    cutoff: number; n: number; below: number; belowAnalytes: string[]; method: string; cutoffNote: string;
    sensitivity: { method: string; n: number; below: number; note: string };
    skipped: { analyte: string; label: string; why: string }[];
    rows: IiRow[];
  };
  excluded: { analyte: string; why: string; lowAtR45: string[]; r45: { crew: string; glucose: number; potassium: number; ownPreflightMinGlucose: number }[] }[];
  withdrawn: { claim: string; status: string; r1PctVsOwnMedianCorrected: Record<string, number>; beyond20PctCorrected: number; why: string }[];
  limits: { id: string; text: string }[];
  computedBy: { python: string; engine: string; reproduce: string };
  engine?: {
    function: string; ranWith: string; rule: string; ruleSource: string; learningChecks: number;
    inputs: Record<string, number[]>;
    crew: EngineCrew[];
    result: { n: number; r1OutsideBand: number; r1BelowBand: number; preflightDrawsOutsideOwnBand: number; preflightDraws: number };
    crossCheck: string;
    honesty: string;
  };
}

export const PROOF = raw as unknown as Proof;

/** Display names for the analyte keys used in the shifted-row note. */
export const SHORT: Record<string, string> = {
  mch: "MCH", mchc: "MCHC", rdw: "RDW", platelet_count: "Platelets", mpv: "MPV",
  absolute_neutrophils: "Neutrophils (count)", absolute_lymphocytes: "Lymphocytes (count)",
  absolute_monocytes: "Monocytes (count)", absolute_eosinophils: "Eosinophils (count)", absolute_basophils: "Basophils (count)",
};
