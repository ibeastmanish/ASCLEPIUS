import { describe, expect, it } from "vitest";
import { decode } from "./cbor";
import { createKeyRing, fromB64 } from "./crypto";
import { DEMO_STATION } from "../ground/demoKeys";
import { open, seal, usingHermes, wrapHermes } from "./earthlink";

describe("Earth link dispatch (web build)", () => {
  it("seals with WebCrypto outside the desktop app and opens it again", async () => {
    const ring = await createKeyRing();
    expect(usingHermes()).toBe(false);
    const s = await seal({ overall: "red", day: 212 }, ring);
    expect(s.alg).toBe("webcrypto");
    // The tablet cannot open its own Earth messages: it holds only the ground PUBLIC key.
    await expect(open(s.payload, ring)).rejects.toThrow(/Ground Station console/);
    expect(await open(s.payload, { groundPrivateJwk: DEMO_STATION.encPrivateJwk, crewPublicJwk: ring.crewSign.publicJwk })).toEqual({ overall: "red", day: 212 });
  });

  it("marks Hermes messages and refuses to open them without the desktop app", async () => {
    const ring = await createKeyRing();
    const w = wrapHermes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(w).toMatchObject({ alg: "hermes", signed: true, encrypted: true });
    expect((decode(fromB64(w.payload)) as { v: number }).v).toBe(2);
    await expect(open(w.payload, ring)).rejects.toThrow(/desktop app/);
  });
});
