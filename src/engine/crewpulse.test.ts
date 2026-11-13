import { describe, expect, it } from "vitest";
import { cabinFlag, feverFlag, pulse, recentDates, solsBetween, type CrewDay } from "./crewpulse";

const T = "2026-11-14";
function day(crew: string, date: string, over: Partial<CrewDay> = {}): CrewDay {
  const n = Number(crew.slice(-1));
  return {
    crew, name: ["", "Asha Rao", "Tomas Lindqvist", "Mei Nakamura", "Kwame Mensah"][n] ?? crew, date,
    day: 212 - solsBetween(date, T), overall: "green",
    values: { bp_sys: 118, bp_dia: 76, hr: 60, glucose: 90, temp: 36.7, sleep: 7.5 }, symptoms: [], patterns: [], ...over,
  };
}
const ids = (f: ReturnType<typeof pulse>) => f.map((x) => x.id);

describe("Crew Pulse: one, some, or all", () => {
  it("one person flagged is individual", () => {
    const f = pulse({ today: T, days: [day("C1", T, { overall: "yellow", values: { hr: 74, sleep: 7 } }), day("C2", T), day("C3", T), day("C4", T)] });
    expect(ids(f)).toEqual(["CP-ONE"]);
    expect(f[0].crews).toEqual(["C1"]);
  });

  it("all green today says so", () => {
    expect(ids(pulse({ today: T, days: [day("C1", T), day("C2", T)] }))).toEqual(["CP-NONE"]);
  });

  it("same complaint in 2+ crew on the SAME sol points to the cabin; CO2 above 3 mmHg makes it red", () => {
    const days = [
      day("C1", T, { overall: "yellow", values: { sleep: 5.2 } }),
      day("C2", T, { overall: "yellow", symptoms: ["headache"] }),
      day("C3", T, { overall: "yellow", patterns: ["PT-FATIGUE"] }),
      day("C4", T),
    ];
    const f = pulse({ today: T, days });
    expect(ids(f)).toEqual(["CP-CABIN"]);
    expect(f[0].status).toBe("yellow");
    expect(f[0].text).toMatch(/not entered/);
    expect(pulse({ today: T, days, cabinCo2: 3.4 })[0]).toMatchObject({ status: "red" });
    expect(pulse({ today: T, days, cabinCo2: 2.1 })[0].text).toMatch(/inside NASA/);
    expect(f[0].source).toMatch(/V2 6004/);
  });

  it("two people flagged on DIFFERENT days is not a cabin pattern", () => {
    const f = pulse({ today: T, days: [
      day("C1", T, { overall: "yellow", symptoms: ["headache"] }),
      day("C2", "2026-11-13", { overall: "yellow", symptoms: ["headache"] }),
      day("C2", T), day("C3", T),
    ] });
    expect(ids(f)).toEqual(["CP-ONE"]);
  });

  it("fever in A then B within 1-3 sols is possible spread; 3 people makes it red", () => {
    const days = [
      day("C4", "2026-11-10", { overall: "yellow", values: { temp: 38.3 }, patterns: ["PT-FEVER"] }),
      day("C3", "2026-11-12", { overall: "yellow", values: { temp: 38.1 } }),
      day("C1", T), day("C2", T), day("C3", T), day("C4", T),
    ];
    const f = pulse({ today: T, days });
    expect(ids(f)).toEqual(["CP-SPREAD"]);
    expect(f[0].crews).toEqual(["C4", "C3"]);
    expect(f[0].text).toMatch(/Kwame \(Sol 208\) → Mei \(Sol 210\)/);
    const three = pulse({ today: T, days: [...days, day("C2", T, { overall: "red", values: { temp: 38.6 } })] });
    expect(three.find((x) => x.id === "CP-SPREAD")!.status).toBe("red");
  });

  it("fever in A then B after 4 sols is NOT spread; the same person twice is not spread", () => {
    expect(ids(pulse({ today: T, days: [
      day("C4", "2026-11-08", { values: { temp: 38.3 } }),
      day("C3", "2026-11-12", { values: { temp: 38.1 } }),
      day("C1", T),
    ] }))).toEqual(["CP-NONE"]);
    expect(ids(pulse({ today: T, days: [
      day("C4", "2026-11-11", { values: { temp: 38.3 } }),
      day("C4", "2026-11-12", { values: { temp: 38.2 } }),
      day("C1", T),
    ] }))).toEqual(["CP-NONE"]);
  });

  it("an old chain that ended more than 3 sols ago is not shown today", () => {
    expect(ids(pulse({ today: T, days: [
      day("C4", "2026-11-05", { values: { temp: 38.3 } }),
      day("C3", "2026-11-07", { values: { temp: 38.1 } }),
      day("C1", T),
    ] }))).toEqual(["CP-NONE"]);
  });

  it("crew-median sleep under 6 h for 3 sols is whole-crew sleep debt", () => {
    const days = recentDates(T, 3).flatMap((d) => [
      day("C1", d, { values: { sleep: 5.5 } }), day("C2", d, { values: { sleep: 5.0 } }), day("C3", d, { values: { sleep: 7.5 } }),
    ]);
    const f = pulse({ today: T, days });
    expect(ids(f)).toContain("CP-SLEEP");
    expect(f.find((x) => x.id === "CP-SLEEP")!.dates).toHaveLength(3);
    // Two sols only: no finding.
    expect(ids(pulse({ today: T, days: days.filter((d) => d.date !== "2026-11-12") }))).not.toContain("CP-SLEEP");
  });

  it("flags are read from values, symptoms and patterns, and mood is never part of the input type", () => {
    expect(cabinFlag(day("C1", T, { symptoms: ["headache"] }))).toBe("headache");
    expect(cabinFlag(day("C1", T, { values: { sleep: 5.9 } }))).toBe("short sleep");
    expect(cabinFlag(day("C1", T))).toBeNull();
    expect(feverFlag(day("C1", T, { values: { temp: 38.0 } }))).toBe(true);
    expect(feverFlag(day("C1", T, { values: { temp: 37.9 } }))).toBe(false);
    expect(recentDates(T, 7)[0]).toBe("2026-11-08");
  });
});

describe("simulated crew (seed/crew.ts) through the real engine", () => {
  it("produces the scripted cabin day and the fever spread, with mood never present", async () => {
    const { otherCrewDays } = await import("../seed/crew");
    const days = otherCrewDays(T, 212);
    expect(days).toHaveLength(21);
    expect(days.every((d) => !("mood" in d.values))).toBe(true);
    const f = pulse({ today: T, days, cabinCo2: 3.4 });
    expect(ids(f)).toEqual(expect.arrayContaining(["CP-CABIN", "CP-SPREAD"]));
    const spread = f.find((x) => x.id === "CP-SPREAD")!;
    expect(spread.crews).toEqual(["MENS-04", "NAKA-03"]);
    expect(f.find((x) => x.id === "CP-CABIN")!.status).toBe("red");
    // Same data, same answer: deterministic.
    expect(otherCrewDays(T, 212)).toEqual(days);
  });
});

describe("NASA HRP risks (challenge Resources tab) are wired into the guidance", async () => {
  const g = (await import("../content/guidance.json")).default as unknown as {
    risks: Record<string, { name: string; url: string }>; entries: Record<string, { risks?: string[] }>;
  };
  it("every card names at least one HRP risk, and every risk it names exists", () => {
    for (const [id, e] of Object.entries(g.entries)) {
      expect(e.risks?.length, id).toBeGreaterThan(0);
      for (const r of e.risks!) expect(g.risks[r], `${id} -> ${r}`).toBeDefined();
    }
    expect(Object.values(g.risks).every((r) => r.name.startsWith("Risk of") && r.url.includes("nasa.gov/hrp/risks"))).toBe(true);
  });
});
