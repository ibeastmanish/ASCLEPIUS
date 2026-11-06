import { describe, expect, it } from "vitest";
import { runCheck } from "../app/record";
import { completeCheck } from "../engine/evaluate";
import { earthFor } from "../engine/horizons";
import { ashaEvents, ASHA_TODAY, ashaProfile } from "../seed/asha";
import { decode, encode } from "./cbor";
import { createKeyRing, fromB64, gzip, openFromCrew, sealForEarth, toB64 } from "./crypto";
import { badges, checksOn, dueIndicators, historyBefore, outboxView, project, streak } from "./projection";
import { createVault, destroyVault, HygieaDB, MemoryStore, openVault, WrongPassphraseError } from "./store";

const TODAY = "2026-11-14";
const FAST = 1000; // PBKDF2 iterations in tests only (production: 600,000)

describe("CBOR", () => {
  it("round-trips nested values", () => {
    const v = { a: 1, b: -5, c: 3.25, d: "héllo", e: [true, false, null], f: new Uint8Array([1, 2, 3]), g: { h: 70000, i: 2 ** 40 } };
    expect(decode(encode(v))).toEqual(v);
  });
});

describe("Health Vault", () => {
  it("keeps data across reopen; wrong passphrase cannot read it; data at rest is ciphertext", async () => {
    const db = new HygieaDB(`t-${Math.random()}`);
    const v = await createVault(db, "correct horse battery staple", FAST);
    await v.append([{ type: "ProfileSet", ts: "x", profile: ashaProfile(TODAY) }]);
    // Reopen (simulates reload).
    const again = await openVault(db, "correct horse battery staple");
    const events = await again.all();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "ProfileSet", profile: { name: "Asha Rao" } });
    await expect(openVault(db, "wrong")).rejects.toBeInstanceOf(WrongPassphraseError);
    const raw = await again.rawSample();
    const asText = new TextDecoder().decode(raw[0].ct);
    expect(asText).not.toContain("Asha");
    await destroyVault(db);
  });
});

describe("Earth messages (sign + encrypt)", () => {
  it("round-trips, and a tampered copy fails", async () => {
    const ring = await createKeyRing();
    const msg = { kind: "red-alert", crew: "ASHA-01", overall: "red", readings: { glucose: [48, "red"] } };
    const sealed = await sealForEarth(msg, ring);
    expect(sealed).toMatchObject({ signed: true, encrypted: true });
    expect(await openFromCrew(sealed.payload, ring)).toEqual(msg);

    const bytes = fromB64(sealed.payload);
    bytes[bytes.length - 5] ^= 0x01;
    await expect(openFromCrew(toB64(bytes), ring)).rejects.toThrow();
  });

  it("rejects a message signed by a different key", async () => {
    const crew = await createKeyRing();
    const impostor = await createKeyRing();
    const sealed = await sealForEarth({ x: 1 }, { ...impostor, ground: crew.ground });
    await expect(openFromCrew(sealed.payload, crew)).rejects.toThrow(/Signature/);
  });
});

describe("seeded persona + projections", () => {
  const events = ashaEvents(TODAY);
  const state = project(events);

  it("has 14 pre-flight and 211 flight checks, ready baselines and a 225-day streak", () => {
    expect(state.checks).toHaveLength(225);
    expect(state.baselines.hr?.ready).toBe(true);
    // Pre-flight median 57 (band 52-62), then slow EWMA drift from green days only.
    expect(state.baselines.hr!.median).toBe(57);
    expect(state.baselines.hr!.center).toBeGreaterThan(56);
    expect(state.baselines.hr!.center).toBeLessThan(58.5);
    expect(state.baselines.hr!.high - state.baselines.hr!.low).toBeCloseTo(10, 6);
    expect(streak(state, TODAY)).toBe(225);
    expect(badges(state, TODAY).find((b) => b.id === "honest")!.earned).toBe(true);
  });

  it("reproduces Journey J3 on Day 212 (?seed=asha)", () => {
    const r = completeCheck(
      { checkId: "j3", ts: `${TODAY}T07:05:00Z`, date: TODAY, day: 212, values: ASHA_TODAY, tags: [], symptoms: [] },
      { baselines: state.baselines, history: historyBefore(state, TODAY), earlierToday: checksOn(state, TODAY), earth: earthFor(TODAY) },
    );
    expect(r.overall).toBe("yellow");
    const status = Object.fromEntries(r.results.map((x) => [x.indicator, x.status]));
    expect(status).toMatchObject({ hr: "yellow", sleep: "yellow", glucose: "green", temp: "green", bp_sys: "green", bp_dia: "green" });
    expect(r.patterns.map((p) => p.id)).toEqual(["PT-FATIGUE"]);
    expect(r.results.find((x) => x.indicator === "hr")!.band).toEqual({ low: 52, high: 62, position: "above" }); // as in PRD 7.5 and the deck
    expect(r.results.find((x) => x.indicator === "sleep")!.why.map((w) => w.ruleId)).toContain("TR-SLEEP-3");
    expect(r.escalation).toBe("recheck");
  });

  it("adaptive frequency asks everything that isn't steadily green", () => {
    const { due, resting } = dueIndicators(state, TODAY);
    expect(due).toEqual(expect.arrayContaining(["hr", "sleep", "mood"]));
    for (const i of resting) expect(["bp_sys", "bp_dia", "glucose", "temp"]).toContain(i);
    expect(dueIndicators(state, TODAY, true).resting).toEqual([]);
  });

  it("seed is deterministic", () => {
    const strip = (e: unknown) => JSON.stringify(e).replace(/"id":"r-[0-9a-f]+"/g, "");
    expect(ashaEvents(TODAY).map(strip)).toEqual(events.map(strip));
  });
});

describe("live check -> events -> outbox", () => {
  it("red check alerts the CMO and queues a signed alert arriving in 11 min; digest < 2 KB", async () => {
    const store = new MemoryStore();
    await store.append(ashaEvents(TODAY));
    const state = project(await store.all());
    const ring = await store.keyRing();
    const now = new Date(`${TODAY}T07:10:00Z`);
    const { result, events } = await runCheck(state, { values: { ...ASHA_TODAY, glucose: 48 }, tags: [], symptoms: [] }, now, TODAY, 212, ring);
    expect(result.overall).toBe("red");
    expect(events.some((e) => e.type === "CmoAlerted")).toBe(true);
    await store.append(events);
    const after = project(await store.all());
    const alert = after.outbox.find((m) => m.kind === "red-alert")!;
    expect(alert.signed && alert.encrypted).toBe(true);
    expect((Date.parse(alert.eta!) - now.getTime()) / 60_000).toBeCloseTo(11.0, 1);
    expect(outboxView(alert, now.getTime() + 60_000, TODAY).state).toBe("in-transit");
    expect(outboxView(alert, now.getTime() + 12 * 60_000, TODAY).state).toBe("delivered");
    const digest = after.outbox.find((m) => m.kind === "digest")!;
    expect(digest.bytes).toBeLessThan(2048);
    expect(await openFromCrew(alert.payload, ring)).toMatchObject({ overall: "red", day: 212 });
    // Recording the check again on the same day does not add a second digest.
    const { events: e2 } = await runCheck(after, { values: { hr: 58 }, tags: [], symptoms: [] }, now, TODAY, 212, ring);
    expect(e2.filter((e) => e.type === "MessageQueued")).toHaveLength(0);
  });

  it("during the Sun blackout the Earth message is held, then released", async () => {
    const date = "2028-03-20";
    const store = new MemoryStore();
    await store.append(ashaEvents(date));
    const state = project(await store.all());
    const now = new Date(`${date}T07:10:00Z`);
    const { events } = await runCheck(state, { values: { glucose: 48 }, tags: [], symptoms: [] }, now, date, 212, await store.keyRing());
    const alert = events.flatMap((e) => (e.type === "MessageQueued" && e.message.kind === "red-alert" ? [e.message] : []))[0];
    expect(alert.held).toBe(true);
    expect(alert.heldUntil).toBe("2028-04-04");
    expect(outboxView(alert, now.getTime(), date).state).toBe("held");
    expect(outboxView(alert, Date.parse("2028-04-05T00:00:00Z"), "2028-04-05").state).toBe("delivered");
  });
});

it("gzip is available (CompressionStream)", async () => {
  expect((await gzip(new Uint8Array(1000))).length).toBeLessThan(100);
});
