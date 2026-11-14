import { describe, expect, it } from "vitest";
import { forecast, longestStreak, summarize } from "./forecast";

describe("Autonomy Forecast: the Reply Clock for every day of the mission", () => {
  const days = forecast(137.4);
  const s = summarize(days);

  it("covers every day of the JPL Horizons table", () => {
    expect(days.length).toBe(1157);
    expect(days[0].date).toBe("2026-11-01");
    expect(days.at(-1)!.date).toBe("2029-12-31");
  });

  it("on Mars an emergency is always the crew's call: Earth can never answer within 10 minutes", () => {
    expect(s.counts.red["crew-decides"]).toBe(days.length);
  });

  it("during the Sun blackout the crew is alone for everything", () => {
    const bo = days.filter((d) => d.blackout);
    expect(bo.length).toBe(27);
    expect(bo.every((d) => d.level.routine === "crew-decides" && d.level.fever === "crew-decides")).toBe(true);
    expect(s.blackout).toMatchObject({ start: "2028-03-08", end: "2028-04-03", days: 27, prepareFrom: "2028-02-07" });
  });

  it("the longest stretch alone for routine problems is the blackout itself", () => {
    expect(s.aloneRoutine).toEqual({ start: "2028-03-08", end: "2028-04-03", days: 27 });
  });

  it("a 4-hour problem flips between 'Earth guides' and 'crew decides' as the Mars sol drifts against Houston", () => {
    const outside = days.filter((d) => !d.blackout);
    expect(outside.some((d) => d.level.fever === "earth-guided")).toBe(true);
    expect(outside.some((d) => d.level.fever === "crew-decides")).toBe(true);
    // The pattern repeats roughly every 37 sols, so it has many separate runs, not one block.
    let runs = 0;
    for (let i = 1; i < outside.length; i++) if (outside[i].level.fever === "earth-guided" && outside[i - 1].level.fever !== "earth-guided") runs++;
    expect(runs).toBeGreaterThan(20);
  });

  it("longestStreak finds the right run and handles none", () => {
    expect(longestStreak(days, "red", "earth-guided")).toBeNull();
  });
});
