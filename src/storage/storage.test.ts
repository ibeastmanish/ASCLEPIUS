import { describe, expect, it } from "vitest";
import { runCheck } from "../app/record";
import { completeCheck } from "../engine/evaluate";
import { earthFor } from "../engine/horizons";
import { ashaEvents, ASHA_TODAY, ashaProfile } from "../seed/asha";
import { decode, encode } from "./cbor";
import { createKeyRing, crewRing, forgeFromCrew, fromB64, gzip, newSigningKey, openFromCrew, PAD_BLOCK, padToBlock, sealForEarth, toB64, unpad, type KeyRing, type OpenKeys } from "./crypto";
import { DEMO_STATION } from "../ground/demoKeys";
import { releaseAt, seqKey, triage } from "../ground/protocol";
import { verifyPacket } from "../ground/station";

/** What the GROUND holds to open a crew message: its own private key + the crew's public key. */
const groundKeys = (ring: KeyRing): OpenKeys => ({ groundPrivateJwk: DEMO_STATION.encPrivateJwk, crewPublicJwk: ring.crewSign.publicJwk });
import { badges, checksOn, dueIndicators, historyBefore, outboxView, project, streak } from "./projection";
import { createVault, destroyVault, AsclepiusDB, MemoryStore, openVault, WrongPassphraseError } from "./store";

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
    const db = new AsclepiusDB(`t-${Math.random()}`);
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
    expect(await openFromCrew(sealed.payload, groundKeys(ring))).toEqual(msg);

    const bytes = fromB64(sealed.payload);
    bytes[bytes.length - 5] ^= 0x01;
    await expect(openFromCrew(toB64(bytes), groundKeys(ring))).rejects.toThrow(/Decryption/);
  });

  it("key separation: the crew tablet never holds the ground private key", async () => {
    const ring = await createKeyRing();
    expect(JSON.stringify(ring)).not.toContain(DEMO_STATION.encPrivateJwk.d);
    expect((ring.ground as { privateJwk?: unknown }).privateJwk).toBeUndefined();
    // A pre-separation vault (ground private key on the tablet) is migrated, not crashed on.
    const legacy = { ...ring, ground: { ...ring.ground, privateJwk: { kty: "EC", d: "old" } } } as KeyRing;
    const m = crewRing(legacy);
    expect(m.migrated).toBe(true);
    expect((m.ring.ground as { privateJwk?: unknown }).privateJwk).toBeUndefined();
  });

  it("rejects a message signed by a different key", async () => {
    const crew = await createKeyRing();
    const impostor = await createKeyRing();
    const sealed = await sealForEarth({ x: 1 }, { ...impostor, ground: crew.ground });
    await expect(openFromCrew(sealed.payload, groundKeys(crew))).rejects.toThrow(/Signature/);
  });

  it("S3: changing the SIGNED body (re-encrypted correctly) is caught by the signature, not AES-GCM", async () => {
    const ring = await createKeyRing();
    const sealed = await sealForEarth({ overall: "red", glucose: 48 }, ring);
    const forged = await forgeFromCrew(sealed.payload, DEMO_STATION.encPrivateJwk, DEMO_STATION.bundle.enc, (s) => ({ ...s, overall: "green", glucose: 92 }));
    await expect(openFromCrew(forged.payload, groundKeys(ring))).rejects.toThrow(/Signature/);
    // Re-signed with the attacker's own key: still rejected, because the ground trusts the paired crew key.
    const attacker = await newSigningKey();
    const resigned = await forgeFromCrew(sealed.payload, DEMO_STATION.encPrivateJwk, DEMO_STATION.bundle.enc, (s) => ({ ...s, overall: "green" }), attacker.privateJwk);
    await expect(openFromCrew(resigned.payload, groundKeys(ring))).rejects.toThrow(/Signature/);
  });
});

describe("Ground Station console (protocol + verification)", () => {
  const packet = (over: Partial<Parameters<typeof releaseAt>[0]> = {}) => ({
    sentAt: "2026-11-14T07:10:00.000Z", sentAtReal: 1_000_000, missionDate: "2026-11-14", mission: "mars" as const, ...over,
  });

  it("holds a packet for the real JPL Horizons light time, x60 in demo warp", () => {
    const r = releaseAt(packet());
    expect(r.oneWayMin).toBeCloseTo(11.01, 2);
    expect(r.releaseMs - 1_000_000).toBeCloseTo(11.01 * 60_000, -2);
    expect(releaseAt(packet(), 60).releaseMs - 1_000_000).toBeCloseTo((11.01 * 60_000) / 60, -1);
    expect(releaseAt(packet({ mission: "moon" })).oneWayMin).toBeLessThan(0.05);
  });

  it("holds everything through the Sun blackout until the first clear day", () => {
    const r = releaseAt(packet({ sentAt: "2028-03-20T07:00:00.000Z", missionDate: "2028-03-20" }));
    expect(r.heldForBlackout).toBe(true);
    expect(r.blackoutEnd).toBe("2028-04-04");
    expect(r.holdMs).toBeGreaterThan(14 * 86_400_000);
  });

  it("triage: red first, then persistent yellow, then yellow, then digests", () => {
    expect(triage({ kind: "red-alert", overall: "red" })).toBe(0);
    expect(triage({ kind: "digest", overall: "yellow", escalation: "tell-cmo" })).toBe(1);
    expect(triage({ kind: "digest", overall: "yellow", escalation: "recheck", rules: ["HR-P1"] })).toBe(2);
    expect(triage({ kind: "digest", overall: "green" })).toBe(3);
  });

  it("verifyPacket: accepts once, rejects the replay, rejects an unpaired crew and a forged body", async () => {
    const ring = await createKeyRing();
    const crewKey = { asclepius: "crew-key" as const, v: 1 as const, crew: "ASHA-01", name: "Asha Rao", sign: ring.crewSign.publicJwk };
    const sealed = await sealForEarth({ seq: 7, crew: "ASHA-01", overall: "red" }, ring);
    const p = {
      asclepius: "dsn-packet" as const, v: 1 as const, id: "m1", kind: "red-alert" as const, priority: 0, crew: "ASHA-01", name: "Asha Rao",
      missionDate: "2026-11-14", mission: "mars" as const, sentAt: "2026-11-14T07:10:00.000Z", sentAtReal: 0,
      payload: sealed.payload, alg: "webcrypto" as const, bytes: sealed.bytes, crewKey, simulated: true,
    };
    const crews = { "ASHA-01": crewKey };
    const seen = new Set<string>();
    const first = await verifyPacket(p, DEMO_STATION, crews, seen);
    expect(first.status).toBe("accepted");
    expect(first.seq).toBe(7);
    expect(first.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    seen.add(first.replayKey!);
    expect(first.replayKey).toBe(seqKey(first.crewFingerprint!, 7));
    const again = await verifyPacket(p, DEMO_STATION, crews, seen);
    expect(again).toMatchObject({ status: "rejected", stage: "replay" });
    expect((await verifyPacket(p, DEMO_STATION, {}, new Set())).status).toBe("unpaired");
    const forged = await forgeFromCrew(sealed.payload, DEMO_STATION.encPrivateJwk, DEMO_STATION.bundle.enc, (s) => ({ ...s, overall: "green" }));
    expect(await verifyPacket({ ...p, payload: forged.payload }, DEMO_STATION, crews, new Set())).toMatchObject({ status: "rejected", stage: "signature" });
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
    // v3: a fatigue pattern on top of a 3-night sleep trend is worth telling the CMO.
    expect(r.escalation).toBe("tell-cmo");
    expect(r.escalationWhy.join(" ")).toMatch(/PT-FATIGUE/);
    expect(r.escalationWhy.join(" ")).toMatch(/TR-SLEEP-3/);
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
    expect(await openFromCrew(alert.payload, groundKeys(ring))).toMatchObject({ overall: "red", day: 212, seq: 1 });
    // The red check sends its own alert; it does not double as the daily digest.
    expect(after.outbox.some((m) => m.kind === "digest")).toBe(false);
    // The next non-red check that day becomes the digest, once.
    const { events: e2 } = await runCheck(after, { values: { hr: 58 }, tags: [], symptoms: [] }, now, TODAY, 212, ring);
    expect(e2.filter((e) => e.type === "MessageQueued")).toHaveLength(1);
    await store.append(e2);
    const after2 = project(await store.all());
    const digest = after2.outbox.find((m) => m.kind === "digest")!;
    // Traffic padding: the digest and the red alert are exactly the same size on the wire.
    expect(digest.bytes).toBe(alert.bytes);
    const { events: e3 } = await runCheck(after2, { values: { hr: 58 }, tags: [], symptoms: [] }, now, TODAY, 212, ring);
    expect(e3.filter((e) => e.type === "MessageQueued")).toHaveLength(0);
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

describe("traffic padding (idea from Hermes): message size reveals nothing", () => {
  it("pads to a whole block and unpads exactly", () => {
    const d = new Uint8Array([1, 2, 3, 250]);
    const p = padToBlock(d);
    expect(p.length).toBe(PAD_BLOCK);
    expect(Array.from(unpad(p))).toEqual([1, 2, 3, 250]);
    expect(padToBlock(new Uint8Array(PAD_BLOCK)).length).toBe(2 * PAD_BLOCK);
  });

  it("a tiny message and a full red-alert snapshot seal to exactly the same size, and both still open", async () => {
    const ring = await createKeyRing();
    const tiny = await sealForEarth({ kind: "digest", overall: "green" }, ring);
    const big = await sealForEarth({
      kind: "red-alert", overall: "red",
      results: Array.from({ length: 8 }, (_, i) => ({ i, why: [{ id: `R-${i}`, text: "x".repeat(120) }] })),
    }, ring);
    expect(tiny.bytes).toBe(big.bytes);
    expect(await openFromCrew(tiny.payload, groundKeys(ring))).toMatchObject({ overall: "green" });
    expect(await openFromCrew(big.payload, groundKeys(ring))).toMatchObject({ overall: "red" });
  });
});
