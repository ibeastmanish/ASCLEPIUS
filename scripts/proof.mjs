#!/usr/bin/env node
// ASCLEPIUS Pillar C: "the same engine runs the science".
//
//   node scripts/proof.mjs        (after python3 -I analysis/i4_proof.py; `npm run proof` runs both)
//
// Loads the app's own band code, src/engine/baseline.ts, through Vite's module
// runner (no copy, no re-implementation), feeds it each Inspiration4 crew
// member's 3 pre-flight MCV draws from data/derived/cbc_corrected.csv, and
// writes the result into src/data/i4_proof.json under "engine".
//
// It also re-derives the same band with a 10-line independent median/MAD and
// checks both agree, and checks its own CSV reading against the Python output.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(ROOT, "data", "derived", "cbc_corrected.csv");
const OUT = join(ROOT, "src", "data", "i4_proof.json");
const PRE = ["L-92", "L-44", "L-3"];

function fail(msg) {
  console.error(`proof: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- the app's code
const opts = { configFile: false, root: ROOT, logLevel: "error" };
const { module: baseline } = await runnerImport("/src/engine/baseline.ts", opts);
const { module: rulesMod } = await runnerImport("/src/engine/rules.ts", opts);
const RULES = rulesMod.RULES;

// MCV is not one of the six in-app indicators, so it has no entry in rules.json.
// Add one with minHalfWidth 0 (no project-defined floor) and keep every other
// rule (window, madScale, k, learningChecks) exactly as the app ships it.
const rules = {
  ...RULES,
  indicators: { ...RULES.indicators, mcv: { ...RULES.indicators.glucose, label: "MCV", unit: "fL", personal: { ruleId: "PROOF-MCV", minHalfWidth: 0, direction: "both" } } },
};

// ---------------------------------------------------------------- data
const lines = readFileSync(CSV, "utf8").trim().split(/\r?\n/);
const header = lines[0].split(",");
const iName = header.indexOf("Sample Name");
const iMcv = header.findIndex((h) => h.startsWith("mcv_value"));
if (iName < 0 || iMcv < 0) fail("cbc_corrected.csv is missing Sample Name or mcv_value");
const series = {};
for (const line of lines.slice(1)) {
  const c = line.split(",");
  const [crew] = c[iName].split("_");
  const tp = c[iName].split("_").find((p) => p.startsWith("L-") || p.startsWith("R+"));
  if (c[iMcv] !== "") (series[crew] ??= {})[tp] = Number(c[iMcv]);
}

const proof = JSON.parse(readFileSync(OUT, "utf8"));

// independent re-derivation (cross-check only)
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x) => Math.round(x * 1000) / 1000;

const crew = Object.keys(series).sort().map((id) => {
  const pre = PRE.map((t) => series[id][t]);
  if (pre.some((v) => !Number.isFinite(v))) fail(`${id}: missing pre-flight MCV`);
  const b = baseline.computeBaseline("mcv", pre, rules);

  const m = med(pre);
  const half = rules.baseline.k * rules.baseline.madScale * med(pre.map((v) => Math.abs(v - m)));
  if (Math.abs(m - b.median) > 1e-9 || Math.abs(half - b.half) > 1e-9) fail(`${id}: engine band disagrees with the independent median/MAD`);

  const py = proof.mcv.crew.find((c) => c.crew === id);
  if (!py || py.preMedian !== b.median || py.preMin !== Math.min(...pre) || py.r1 !== series[id]["R+1"]) fail(`${id}: Node and Python read different MCV values`);

  const r1 = series[id]["R+1"];
  return {
    crew: id,
    preflight: pre,
    median: r3(b.median),
    spread: r3(b.spread),
    half: r3(b.half),
    low: r3(b.low),
    high: r3(b.high),
    ready: b.ready,
    r1,
    preflightOutsideBand: pre.filter((v) => v < b.low || v > b.high).length,
    r1OutsideBand: r1 < b.low || r1 > b.high,
    r1BelowBand: r1 < b.low,
  };
});

const outside = crew.filter((c) => c.r1OutsideBand).length;
const preOut = crew.reduce((a, c) => a + c.preflightOutsideBand, 0);
proof.engine = {
  function: "computeBaseline() in src/engine/baseline.ts",
  ranWith: "node scripts/proof.mjs, which loads the TypeScript source through Vite's module runner (vite runnerImport)",
  rule: `band = median ± max(${rules.baseline.k} × ${rules.baseline.madScale} × MAD, minHalfWidth) of the learning values`,
  ruleSource: "src/engine/rules.json (baseline.k, baseline.madScale); minHalfWidth set to 0 for MCV, which is not an in-app indicator",
  learningChecks: rules.baseline.learningChecks,
  inputs: Object.fromEntries(crew.map((c) => [c.crew, c.preflight])),
  crew,
  result: { n: crew.length, r1OutsideBand: outside, r1BelowBand: crew.filter((c) => c.r1BelowBand).length, preflightDrawsOutsideOwnBand: preOut, preflightDraws: crew.length * PRE.length },
  crossCheck: "same band re-derived with an independent median/MAD in scripts/proof.mjs: identical; Node and Python read identical MCV values",
  honesty:
    `The app only switches a band on after ${rules.baseline.learningChecks} checks (ready = false here: 3 draws). ` +
    "This calls the same band function directly on 3 draws to show what it computes; the headline comparison " +
    "(below the person's own lowest pre-flight value) is the simpler min/max rule from analysis/i4_proof.py. " +
    `With only 3 points the median/MAD band is very narrow: ${preOut} of ${crew.length * PRE.length} pre-flight draws ` +
    "already fall outside their own band, which is exactly why the app waits for more checks.",
};

writeFileSync(OUT, JSON.stringify(proof, null, 1) + "\n");
console.log(`proof: engine band on 3 pre-flight MCV draws (k=${rules.baseline.k}, MAD×${rules.baseline.madScale})`);
for (const c of crew) console.log(`  ${c.crew}: ${c.low.toFixed(2)}-${c.high.toFixed(2)} fL, R+1 ${c.r1} ${c.r1OutsideBand ? "OUTSIDE" : "inside"}`);
console.log(`  R+1 outside the engine's band: ${outside} of ${crew.length}; pre-flight draws outside their own band: ${preOut} of ${crew.length * PRE.length}`);
