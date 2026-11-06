// One place that seals Earth messages and opens them on the "ground".
// Web build: WebCrypto (crypto.ts). Desktop build: Hermes OpenPGP (Rust, via hermes.ts).
import { decode, encode } from "./cbor";
import { gunzip, gzip, openFromCrew, sealForEarth, toB64, fromB64, type KeyRing, type SealedMessage } from "./crypto";
import { hermes, inDesktopApp } from "./hermes";

/** Format tag inside the payload. v1 = WebCrypto CBOR envelope, v2 = OpenPGP message from Hermes. */
const HERMES_V = 2;

let hermesReady = false;
/** Set by the app after Hermes unlocks or locks, so sealing never waits on a failed bridge. */
export function setHermesReady(ready: boolean) {
  hermesReady = ready;
}

export function usingHermes(): boolean {
  return hermesReady && inDesktopApp();
}

/** Encode a sealed OpenPGP message so it travels like the web build's payloads. */
export function wrapHermes(pgp: Uint8Array): SealedMessage {
  const outer = encode({ v: HERMES_V, alg: "OpenPGP/Hermes", pgp });
  return { payload: toB64(outer), bytes: outer.length, signed: true, encrypted: true, alg: "hermes" };
}

export async function seal(summary: unknown, ring: KeyRing): Promise<SealedMessage> {
  if (usingHermes()) {
    try {
      return wrapHermes(await hermes.seal(await gzip(encode(summary))));
    } catch (e) {
      // A medical alert must still go out. Fall back, and the Outbox shows it was WebCrypto.
      console.warn("Hermes sealing failed; using WebCrypto", e);
    }
  }
  return sealForEarth(summary, ring);
}

export async function open(payload: string, ring: KeyRing): Promise<unknown> {
  const outer = decode(fromB64(payload)) as { v?: number; pgp?: Uint8Array };
  if (outer?.v === HERMES_V) {
    if (!inDesktopApp()) throw new Error("sealed with Hermes OpenPGP; open it in the HYGIEA desktop app");
    if (!(outer.pgp instanceof Uint8Array)) throw new Error("malformed message");
    return decode(await gunzip(await hermes.open(outer.pgp)));
  }
  return openFromCrew(payload, ring);
}
