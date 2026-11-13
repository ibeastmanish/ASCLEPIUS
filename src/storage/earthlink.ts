// One place that seals Earth messages and opens them on the "ground".
// Web build: WebCrypto (crypto.ts). Desktop build: Hermes OpenPGP (Rust, via hermes.ts).
// The crew tablet holds only the ground station PUBLIC key; opening a web-sealed
// message needs the ground private key, which only the Ground Station console has.
import { decode, encode } from "./cbor";
import {
  DEMO_GROUND_PUBLIC, groundFromBundle, groundOf, gunzip, gzip, openFromCrew, sealForEarth, toB64, fromB64,
  type GroundKeyBundle, type GroundPublic, type KeyRing, type OpenKeys, type SealedMessage,
} from "./crypto";
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
  return sealForEarth(summary, withPairing(ring));
}

function isRing(k: KeyRing | OpenKeys): k is KeyRing {
  return "crewSign" in k;
}

/**
 * Open a sealed message. Hermes (desktop) messages open through the desktop app.
 * WebCrypto messages need the ground station's private key (`OpenKeys`); a crew
 * KeyRing holds only the ground public key, so it cannot open them.
 */
export async function open(payload: string, keys: KeyRing | OpenKeys): Promise<unknown> {
  const outer = decode(fromB64(payload)) as { v?: number; pgp?: Uint8Array };
  if (outer?.v === HERMES_V) {
    if (!inDesktopApp()) throw new Error("sealed with Hermes OpenPGP; open it in the ASCLEPIUS desktop app");
    if (!(outer.pgp instanceof Uint8Array)) throw new Error("malformed message");
    return decode(await gunzip(await hermes.open(outer.pgp)));
  }
  if (isRing(keys)) throw new Error("this tablet holds only the ground station's public key; open the message in the Ground Station console");
  return openFromCrew(payload, keys);
}

// ------------------------------------------------------------------ pairing
// The paired ground station public key belongs in the vault keyring. Until the
// store can persist it (EventStore.setGroundKey), it is kept in this browser's
// localStorage. It is a PUBLIC key: no secret is stored outside the vault.
const PAIR_KEY = "asclepius-ground-pairing";

interface PairingStore { setGroundKey?: (g: GroundPublic) => Promise<void> }

function readLocalPairing(): GroundPublic | null {
  try {
    const raw = localStorage.getItem(PAIR_KEY);
    return raw ? groundFromBundle(parseGroundBundle(raw)) : null;
  } catch {
    return null;
  }
}

/** The ring as it seals: paired station (vault, then local pairing), else the demo station. */
export function withPairing(ring: KeyRing): KeyRing {
  const g = groundOf(ring);
  if (!g.demo) return { ...ring, ground: g };
  const local = readLocalPairing();
  return { ...ring, ground: local ?? g };
}

/** The ground station this tablet currently seals to. */
export function pairedGround(ring: KeyRing): GroundPublic {
  return withPairing(ring).ground;
}

/** Parse pasted ground station key JSON. Throws on anything that is not a public ground bundle. */
export function parseGroundBundle(text: string): GroundKeyBundle {
  let b: Partial<GroundKeyBundle> & { enc?: JsonWebKey & { d?: string }; sign?: JsonWebKey & { d?: string } };
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error("That is not valid JSON. Copy the whole key block from the Ground Station console.");
  }
  if (b?.asclepius !== "ground-station-key" || !b.enc?.x || !b.enc?.y || !b.sign?.x || !b.sign?.y) {
    throw new Error("That is not a ground station public key.");
  }
  if (b.enc.d || b.sign.d) throw new Error("That block contains a PRIVATE key. Paste only the public key from the console.");
  return { asclepius: "ground-station-key", v: 1, name: String(b.name ?? "Ground station").slice(0, 60), demo: !!b.demo, enc: b.enc, sign: b.sign };
}

/** Pair this tablet with a ground station (public key only). */
export async function pairGround(store: unknown, bundle: GroundKeyBundle | null): Promise<void> {
  const g = groundFromBundle(bundle ?? DEMO_GROUND_PUBLIC);
  const s = store as PairingStore | null;
  if (s && typeof s.setGroundKey === "function") {
    await s.setGroundKey(g);
    try { localStorage.removeItem(PAIR_KEY); } catch { /* none */ }
    return;
  }
  try {
    if (!bundle || bundle.demo) localStorage.removeItem(PAIR_KEY);
    else localStorage.setItem(PAIR_KEY, JSON.stringify(bundle));
  } catch {
    throw new Error("This browser blocks local storage, so the pairing cannot be saved.");
  }
}
