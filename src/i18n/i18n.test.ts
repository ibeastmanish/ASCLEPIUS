// S2 "Delay is delay": the Telugu table covers every key the daily check asks
// for, t() falls back to English, and the clinic defaults drive the Reply Clock.
import { describe, expect, it } from "vitest";
import { clinicLink, linkFor } from "../engine/replyclock";
import { RULES } from "../engine/rules";
import { CHECK_KEYS, CLINIC_DEFAULTS, EN, TE, TE_META, flatten, fmtTz, makeT, t, type Key } from "./index";

describe("Telugu daily-check table", () => {
  it("has every key the daily check requests, and nothing else", () => {
    const missing = CHECK_KEYS.filter((k) => !TE[k] || !TE[k]!.trim());
    expect(missing).toEqual([]);
    const extra = Object.keys(TE).filter((k) => !(k in EN));
    expect(extra).toEqual([]);
  });

  it("lists only real keys as needing review, and still says who reviewed it (nobody yet)", () => {
    for (const k of TE_META.needsReview) expect(CHECK_KEYS, k).toContain(k);
    expect(TE_META.reviewedBy).toBeNull();
  });

  it("keeps the context and symptom labels in step with rules.json", () => {
    for (const [c, v] of Object.entries(RULES.context)) expect(EN[`context.${c}` as Key], c).toBe(v.label);
    for (const [s, label] of Object.entries(RULES.symptoms.list)) expect(EN[`symptoms.${s}` as Key], s).toBe(label);
    expect(EN["context.meal"]).toBe("After a meal");
    expect(EN["context.dizzy"]).toBe("Dizzy when standing");
  });

  it("flattens nested JSON and arrays into dotted keys, skipping _meta", () => {
    expect(flatten({ _meta: { x: "1" }, a: { b: "c" }, m: ["p", "q"] })).toEqual({ "a.b": "c", "m.0": "p", "m.1": "q" });
  });
});

describe("t()", () => {
  it("returns Telugu for te and English otherwise", () => {
    expect(t("screen.title", "te")).toBe("రోజువారీ తనిఖీ");
    expect(t("screen.title", "en")).toBe("Daily check");
    expect(t("screen.title", undefined)).toBe("Daily check");
    expect(t("status.red", "te")).toBe("వెంటనే చర్య తీసుకోండి");
  });

  it("falls back to English for a key the language is missing", () => {
    const partial = makeT({ te: { "screen.title": "రోజువారీ తనిఖీ" } });
    expect(partial("screen.title", "te")).toBe("రోజువారీ తనిఖీ");
    expect(partial("screen.finish", "te")).toBe("Finish check");
  });

  it("fills placeholders and leaves numbers as digits", () => {
    expect(t("screen.learning", "en", { n: 3, need: 7 })).toBe("Learning your normal: 3 of 7");
    expect(t("screen.learning", "te", { n: 3, need: 7 })).toBe("మీ సాధారణ పరిధి నేర్చుకుంటున్నాం: 7లో 3");
    expect(t("screen.add_tile", "te", { tile: t("tiles.bp", "te") })).toBe("రక్తపోటు (బీపీ) జోడించండి");
  });
});

describe("rural clinic defaults in the Reply Clock", () => {
  it("names the PHC doctor as the far end, 180 min each way, open 09:00-17:00 IST", () => {
    const l = clinicLink(CLINIC_DEFAULTS);
    expect(l.far).toBe("the PHC doctor");
    expect(l.oneWayMin).toBe(180);
    expect(l.blackout).toBe(false);
    expect(l.shift).toMatchObject({ startUtcHour: 3.5, hours: 8 }); // 09:00 IST = 03:30 UTC
    expect(l.shift!.label).toContain("09:00-17:00");
    expect(fmtTz(CLINIC_DEFAULTS.tzOffsetMin)).toBe("+05:30");
    expect(fmtTz(-360)).toBe("-06:00");
  });

  it("linkFor switches to the clinic only when the setting is on", () => {
    const on = linkFor("2026-11-14", "mars", { ...CLINIC_DEFAULTS, on: true });
    expect(on.far).toBe("the PHC doctor");
    expect(on.oneWayMin).toBe(180);
    const off = linkFor("2026-11-14", "mars", { ...CLINIC_DEFAULTS, on: false });
    expect(off.shift).toBeUndefined();
    expect(off.oneWayMin).toBeCloseTo(11, 0);
  });
});

describe("Hindi draft", () => {
  it("has every key the daily check asks for, and falls back to English for none of them", async () => {
    const { CHECK_KEYS, HI } = await import("./index");
    for (const k of CHECK_KEYS) expect(HI[k], k).toBeTruthy();
    expect(t("screen.title", "hi")).toBe("दैनिक जाँच");
    expect(t("screen.learning", "hi", { n: 3, need: 7 })).toBe("आपका सामान्य स्तर सीख रहे हैं: 7 में से 3");
  });
});
