// Health Vault crypto (WebCrypto only, no dependencies).
//  - Vault key: PBKDF2-SHA-256 (600,000 iterations [VERIFY current OWASP guidance]) -> AES-GCM 256.
//    Non-extractable, held in memory only.
//  - Earth messages: CBOR -> gzip -> ECDSA P-256 signature (crew key) ->
//    ECDH P-256 + AES-GCM 256 encryption to the flight surgeon's public key.
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
export interface KeyRing {
  /** Crew signing key pair (ECDSA P-256). */
  crewSign: { publicJwk: JsonWebKey; privateJwk: JsonWebKey };
  /** Flight surgeon key pair (ECDH P-256). Simulated ground station: the
   *  private half is kept only so the demo can show decryption + verification. */
  ground: { publicJwk: JsonWebKey; privateJwk: JsonWebKey; simulated: true };
}

const ECDSA = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

export async function createKeyRing(): Promise<KeyRing> {
  const s = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const g = await subtle.generateKey(ECDH, true, ["deriveKey"]);
  return {
    crewSign: { publicJwk: await subtle.exportKey("jwk", s.publicKey), privateJwk: await subtle.exportKey("jwk", s.privateKey) },
    ground: { publicJwk: await subtle.exportKey("jwk", g.publicKey), privateJwk: await subtle.exportKey("jwk", g.privateKey), simulated: true },
  };
}

export async function fingerprint(jwk: JsonWebKey): Promise<string> {
  const h = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(`${jwk.x}.${jwk.y}`)));
  return Array.from(h.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().replace(/(.{4})(?!$)/g, "$1 ");
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

/** Sign then encrypt a summary for the flight surgeon. */
export async function sealForEarth(summary: unknown, ring: KeyRing): Promise<SealedMessage> {
  const body = await gzip(encode(summary));
  const signKey = await subtle.importKey("jwk", ring.crewSign.privateJwk, ECDSA, false, ["sign"]);
  const sig = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signKey, body));
  const inner = encode({ body, sig });

  const eph = await subtle.generateKey(ECDH, true, ["deriveKey"]);
  const groundPub = await subtle.importKey("jwk", ring.ground.publicJwk, ECDH, false, []);
  const aes = await aesFromEcdh(eph.privateKey, groundPub, ["encrypt"]);
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, aes, buf(inner)));
  const epk = new Uint8Array(await subtle.exportKey("raw", eph.publicKey));
  const outer = encode({ v: 1, alg: "ES256+ECDH-ES-P256/A256GCM", epk, iv, ct });
  return { payload: toB64(outer), bytes: outer.length, signed: true, encrypted: true, alg: "webcrypto" };
}

/** Ground side: decrypt and verify. Throws if tampered or not signed by the crew key. */
export async function openFromCrew(payload: string, ring: KeyRing): Promise<unknown> {
  const outer = decode(fromB64(payload)) as { v: number; epk: Uint8Array; iv: Uint8Array; ct: Uint8Array };
  const epk = await subtle.importKey("raw", buf(outer.epk), ECDH, false, []);
  const groundPriv = await subtle.importKey("jwk", ring.ground.privateJwk, ECDH, false, ["deriveKey"]);
  const aes = await aesFromEcdh(groundPriv, epk, ["decrypt"]);
  const inner = decode(new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: buf(outer.iv) }, aes, buf(outer.ct)))) as { body: Uint8Array; sig: Uint8Array };
  const verifyKey = await subtle.importKey("jwk", ring.crewSign.publicJwk, ECDSA, false, ["verify"]);
  const ok = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifyKey, buf(inner.sig), buf(inner.body));
  if (!ok) throw new Error("Signature check failed");
  return decode(await gunzip(inner.body));
}
