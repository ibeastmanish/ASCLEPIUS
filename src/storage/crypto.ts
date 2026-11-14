// Health Vault crypto (WebCrypto only, no dependencies).
//  - Vault key: PBKDF2-SHA-256 (600,000 iterations [VERIFY current OWASP guidance]) -> AES-GCM 256.
//    Non-extractable, held in memory only.
//  - Earth messages: CBOR -> gzip -> ECDSA P-256 signature (crew key) ->
//    ECDH P-256 + AES-GCM 256 encryption to the ground station PUBLIC key.
//    The ground private key never lives on the crew tablet (see ground.html).
//    (Web build. The Tauri build is planned to use Hermes OpenPGP instead.)
import { decode, encode } from "./cbor";

export const PBKDF2_ITERATIONS = 600_000;
const subtle = globalThis.crypto.subtle;

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function toB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function buf(b: Uint8Array): Uint8Array<ArrayBuffer> {
  // Copy into a fresh ArrayBuffer-backed view (WebCrypto rejects SharedArrayBuffer views).
  return new Uint8Array(b);
}

// ------------------------------------------------------------------ vault key
export async function deriveVaultKey(passphrase: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: buf(salt), iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface Sealed { iv: Uint8Array<ArrayBuffer>; ct: Uint8Array<ArrayBuffer> }

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const pt = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, pt));
  return { iv, ct };
}

export async function decryptJSON<T>(key: CryptoKey, s: { iv: Uint8Array; ct: Uint8Array }): Promise<T> {
  const pt = await subtle.decrypt({ name: "AES-GCM", iv: buf(s.iv) }, key, buf(s.ct));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

// ------------------------------------------------------------------ compression
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([buf(data)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export const gzip = (d: Uint8Array) => pipe(d, new CompressionStream("gzip"));
export const gunzip = (d: Uint8Array) => pipe(d, new DecompressionStream("gzip"));

// ------------------------------------------------------------------ message keys
// Key separation (PRD v3 section 7): the crew tablet holds its own signing key
// and only the PUBLIC half of the ground station's keys. The ground station's
// private keys live in the Ground Station console (ground.html), never here.

/** Public keys of a ground station, as the crew tablet stores them. */
export interface GroundPublic {
  /** ECDH P-256: messages to Earth are encrypted to this key. (Name kept for old vaults.) */
  publicJwk: JsonWebKey;
  /** ECDSA P-256: the ground station signs its replies with this key. */
  signPublicJwk?: JsonWebKey;
  name?: string;
  /** True for the shipped demo ground station (its private keys are public knowledge). */
  demo?: boolean;
  /** LEGACY ONLY: vaults created before key separation stored the ground private key here.
   *  It is never used and is removed by `crewRing()`. */
  privateJwk?: JsonWebKey;
  simulated?: boolean;
}

export interface KeyRing {
  /** Crew signing key pair (ECDSA P-256). */
  crewSign: { publicJwk: JsonWebKey; privateJwk: JsonWebKey };
  /** Ground station PUBLIC keys only. */
  ground: GroundPublic;
}

/** Shareable ground station public key (what the console shows for pairing). */
export interface GroundKeyBundle {
  asclepius: "ground-station-key";
  v: 1;
  name: string;
  demo?: boolean;
  enc: JsonWebKey;
  sign: JsonWebKey;
}

/** Shareable crew public key (what the Outbox shows for pairing). */
export interface CrewKeyBundle {
  asclepius: "crew-key";
  v: 1;
  crew: string;
  name: string;
  sign: JsonWebKey;
}

/** Demo ground station PUBLIC keys. The matching private keys ship only in the
 *  Ground Station console bundle (src/ground/demoKeys.ts), labelled "demo keys". */
export const DEMO_GROUND_PUBLIC: GroundKeyBundle = {
  asclepius: "ground-station-key",
  v: 1,
  name: "Demo ground station",
  demo: true,
  enc: { kty: "EC", crv: "P-256", x: "MQgOiqk5PEDaEvKkbdY1k9BIA1Hl6wHInYKECCRjHFg", y: "_Xuj0UBhWUPNmDqUZM1GTO9Vd5gLLWXx3jCY3OF8tck" },
  sign: { kty: "EC", crv: "P-256", x: "ZFjHSpd94fnNjU9lvqKrWKXsyNGgdd7ZM3h0i5QojfE", y: "4uuiRv1ZtQaoHM81ugEM6Re97ug78wQ4rbsfz7_TWyA" },
};

const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const SHA = { name: "ECDSA", hash: "SHA-256" } as const;

/** Only the public coordinates of an EC key (drops `d`, key_ops, ext). */
export function publicOnly(j: JsonWebKey): JsonWebKey {
  return { kty: j.kty, crv: j.crv, x: j.x, y: j.y };
}

export function groundFromBundle(b: GroundKeyBundle): GroundPublic {
  return { publicJwk: publicOnly(b.enc), signPublicJwk: publicOnly(b.sign), name: b.name, demo: !!b.demo };
}

export function bundleFromGround(g: GroundPublic): GroundKeyBundle {
  return { asclepius: "ground-station-key", v: 1, name: g.name ?? "Ground station", demo: g.demo, enc: publicOnly(g.publicJwk), sign: publicOnly(g.signPublicJwk ?? g.publicJwk) };
}

export function sameKey(a?: JsonWebKey, b?: JsonWebKey): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

export async function createKeyRing(ground: GroundKeyBundle = DEMO_GROUND_PUBLIC): Promise<KeyRing> {
  const s = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  return {
    crewSign: { publicJwk: publicOnly(await subtle.exportKey("jwk", s.publicKey)), privateJwk: await subtle.exportKey("jwk", s.privateKey) },
    ground: groundFromBundle(ground),
  };
}

/**
 * Migration for vaults created before key separation: they held a ground key
 * pair generated on the tablet. Drop the private half and point the tablet at the
 * demo ground station (the console never had that old key, so it could not read
 * messages sealed to it anyway). Safe on new rings and on malformed old data.
 */
export function crewRing(ring: KeyRing): { ring: KeyRing; migrated: boolean } {
  const g = (ring as Partial<KeyRing>).ground;
  if (g && !g.privateJwk && g.publicJwk?.x) return { ring, migrated: false };
  return { ring: { crewSign: ring.crewSign, ground: groundFromBundle(DEMO_GROUND_PUBLIC) }, migrated: true };
}

/** The ground public key a ring actually seals to (legacy rings fall back to the demo station). */
export function groundOf(ring: KeyRing): GroundPublic {
  return crewRing(ring).ring.ground;
}

export async function fingerprint(jwk: JsonWebKey): Promise<string> {
  const h = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(`${jwk.x}.${jwk.y}`)));
  return Array.from(h.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().replace(/(.{4})(?!$)/g, "$1 ");
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : buf(data);
  const h = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function aesFromEcdh(privateKey: CryptoKey, publicKey: CryptoKey, usage: KeyUsage[]): Promise<CryptoKey> {
  return subtle.deriveKey({ name: "ECDH", public: publicKey }, privateKey, { name: "AES-GCM", length: 256 }, false, usage);
}

export interface SealedMessage {
  /** base64 of CBOR {v, alg, epk, iv, ct} */
  payload: string;
  bytes: number;
  signed: boolean;
  encrypted: boolean;
  /** Which crypto sealed it: WebCrypto (web build) or Hermes OpenPGP (desktop build). */
  alg: "webcrypto" | "hermes";
}

async function signBytes(body: Uint8Array, privateJwk: JsonWebKey): Promise<Uint8Array<ArrayBuffer>> {
  const k = await subtle.importKey("jwk", { ...privateJwk, key_ops: undefined, ext: undefined }, ECDSA, false, ["sign"]);
  return new Uint8Array(await subtle.sign(SHA, k, buf(body)));
}

async function verifyBytes(body: Uint8Array, sig: Uint8Array, publicJwk: JsonWebKey): Promise<boolean> {
  const k = await subtle.importKey("jwk", publicOnly(publicJwk), ECDSA, false, ["verify"]);
  return subtle.verify(SHA, k, buf(sig), buf(body));
}

// ------------------------------------------------------------------ traffic padding
// Idea carried over from the author's earlier project Hermes: hide message SIZE.
// Without padding, a red alert (full decision snapshot) is larger than a daily
// digest, so anyone watching the Mars-Earth link could tell an emergency from
// routine traffic without decrypting anything. Every plaintext is padded to the
// same block (a 4-byte length, the envelope, then zero bytes) before AES-GCM.

/** Padded plaintext size in bytes. Messages larger than this round up to a whole number of blocks. */
export const PAD_BLOCK = 4096;

export function padToBlock(data: Uint8Array, block = PAD_BLOCK): Uint8Array<ArrayBuffer> {
  const total = Math.ceil((data.length + 4) / block) * block;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(data, 4);
  return out;
}

export function unpad(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const n = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
  if (n + 4 > data.length) throw new Error("bad padding");
  return buf(data.subarray(4, 4 + n));
}

/** Outer format version for padded WebCrypto messages (v1 = unpadded, legacy; v2 = Hermes OpenPGP, desktop). */
export const PADDED_V = 3;

/** Encrypt an already signed inner envelope {body, sig} to a ground ECDH public key (padded, see above). */
async function encryptToGround(inner: { body: Uint8Array; sig: Uint8Array }, groundEnc: JsonWebKey): Promise<SealedMessage> {
  const eph = await subtle.generateKey(ECDH, true, ["deriveKey"]);
  const groundPub = await subtle.importKey("jwk", publicOnly(groundEnc), ECDH, false, []);
  const aes = await aesFromEcdh(eph.privateKey, groundPub, ["encrypt"]);
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, aes, padToBlock(encode(inner))));
  const epk = new Uint8Array(await subtle.exportKey("raw", eph.publicKey));
  const outer = encode({ v: PADDED_V, alg: "ES256+ECDH-ES-P256/A256GCM+PAD4096", epk, iv, ct });
  return { payload: toB64(outer), bytes: outer.length, signed: true, encrypted: true, alg: "webcrypto" };
}

/** Sign (crew key) then encrypt (ground PUBLIC key) a summary for the flight surgeon. */
export async function sealForEarth(summary: unknown, ring: KeyRing): Promise<SealedMessage> {
  const body = await gzip(encode(summary));
  const sig = await signBytes(body, ring.crewSign.privateJwk);
  return encryptToGround({ body, sig }, groundOf(ring).publicJwk);
}

/** Keys the GROUND needs to open a crew message. The crew tablet never has `groundPrivateJwk`. */
export interface OpenKeys {
  /** Ground station ECDH private key. */
  groundPrivateJwk: JsonWebKey;
  /** The crew member's signing PUBLIC key (paired with the ground station). */
  crewPublicJwk: JsonWebKey;
}

export type SealFailure = "format" | "decrypt" | "signature";
export class SealError extends Error {
  readonly stage: SealFailure;
  constructor(stage: SealFailure, message: string) {
    super(message);
    this.stage = stage;
  }
}

/** Step 1 (ground): decrypt with the ground private key. Fails if the ciphertext was changed. */
export async function decryptFromCrew(payload: string, groundPrivateJwk: JsonWebKey): Promise<{ body: Uint8Array<ArrayBuffer>; sig: Uint8Array<ArrayBuffer> }> {
  let outer: { v: number; epk: Uint8Array; iv: Uint8Array; ct: Uint8Array };
  try {
    outer = decode(fromB64(payload)) as typeof outer;
    if (!(outer?.epk instanceof Uint8Array) || !(outer.ct instanceof Uint8Array)) throw new Error("bad envelope");
  } catch {
    throw new SealError("format", "Not a sealed ASCLEPIUS message");
  }
  try {
    const epk = await subtle.importKey("raw", buf(outer.epk), ECDH, false, []);
    const groundPriv = await subtle.importKey("jwk", { ...groundPrivateJwk, key_ops: undefined, ext: undefined }, ECDH, false, ["deriveKey"]);
    const aes = await aesFromEcdh(groundPriv, epk, ["decrypt"]);
    const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: buf(outer.iv) }, aes, buf(outer.ct)));
    // v3 messages are padded (traffic padding); v1 messages from older outboxes are not.
    const inner = decode(outer.v === PADDED_V ? unpad(plain) : plain) as { body: Uint8Array; sig: Uint8Array };
    return { body: buf(inner.body), sig: buf(inner.sig) };
  } catch {
    throw new SealError("decrypt", "Decryption failed (AES-GCM integrity check): changed in transit, or sealed to another ground key");
  }
}

export interface Opened {
  summary: unknown;
  /** SHA-256 (hex) of the signed body bytes: the exact snapshot the crew signed. */
  bodyHash: string;
}

/** Ground side: decrypt, then verify the crew signature over the body. Throws SealError. */
export async function openFromCrew(payload: string, keys: OpenKeys): Promise<unknown> {
  return (await openVerified(payload, keys)).summary;
}

export async function openVerified(payload: string, keys: OpenKeys): Promise<Opened> {
  const { body, sig } = await decryptFromCrew(payload, keys.groundPrivateJwk);
  if (!(await verifyBytes(body, sig, keys.crewPublicJwk))) {
    throw new SealError("signature", "Signature check failed: the signed body was changed, or it was not signed by this crew member's key");
  }
  return { summary: decode(await gunzip(body)), bodyHash: await sha256Hex(body) };
}

/**
 * Tamper demo (S3). Acts as an attacker who can decrypt (or a corrupted relay):
 * opens the message, changes the SIGNED body, and re-encrypts it properly to the
 * ground PUBLIC key, so AES-GCM passes and only the signature can catch it.
 * With `forgeWith`, the attacker also re-signs the changed body with their own key.
 */
export async function forgeFromCrew(
  payload: string,
  groundPrivateJwk: JsonWebKey,
  groundPublicJwk: JsonWebKey,
  change: (summary: Record<string, unknown>) => Record<string, unknown>,
  forgeWith?: JsonWebKey,
): Promise<SealedMessage> {
  const { body, sig } = await decryptFromCrew(payload, groundPrivateJwk);
  const changed = await gzip(encode(change(decode(await gunzip(body)) as Record<string, unknown>)));
  const newSig = forgeWith ? await signBytes(changed, forgeWith) : sig;
  return encryptToGround({ body: changed, sig: newSig }, groundPublicJwk);
}

/** A throwaway signing key pair (forged-key test, tests). */
export async function newSigningKey(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const s = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  return { publicJwk: publicOnly(await subtle.exportKey("jwk", s.publicKey)), privateJwk: await subtle.exportKey("jwk", s.privateKey) };
}

/** A fresh ground station: ECDH (decrypt) + ECDSA (sign replies) private keys. */
export async function newGroundKeys(name: string): Promise<{ bundle: GroundKeyBundle; encPrivateJwk: JsonWebKey; signPrivateJwk: JsonWebKey }> {
  const e = await subtle.generateKey(ECDH, true, ["deriveKey"]);
  const s = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  return {
    bundle: { asclepius: "ground-station-key", v: 1, name, enc: publicOnly(await subtle.exportKey("jwk", e.publicKey)), sign: publicOnly(await subtle.exportKey("jwk", s.publicKey)) },
    encPrivateJwk: await subtle.exportKey("jwk", e.privateKey),
    signPrivateJwk: await subtle.exportKey("jwk", s.privateKey),
  };
}

// ------------------------------------------------------------------ signed plain JSON (ground replies)
export interface SignedJSON { body: string; sig: string }

/** Canonical JSON text + ECDSA P-256 signature, both base64. */
export async function signJSON(value: unknown, privateJwk: JsonWebKey): Promise<SignedJSON> {
  const body = new TextEncoder().encode(JSON.stringify(value));
  return { body: toB64(body), sig: toB64(await signBytes(body, privateJwk)) };
}

/** Returns the value if the signature matches `publicJwk`, otherwise throws SealError("signature"). */
export async function verifyJSON<T>(s: SignedJSON, publicJwk: JsonWebKey): Promise<T> {
  let body: Uint8Array, sig: Uint8Array;
  try {
    body = fromB64(s.body);
    sig = fromB64(s.sig);
  } catch {
    throw new SealError("format", "Malformed signed message");
  }
  if (!(await verifyBytes(body, sig, publicJwk))) throw new SealError("signature", "Signature check failed");
  return JSON.parse(new TextDecoder().decode(body)) as T;
}
