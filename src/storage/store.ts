// Event stores. VaultStore = Dexie/IndexedDB, every event encrypted (AES-GCM).
// MemoryStore = nothing persisted (video mode, tests).
import Dexie, { type Table } from "dexie";
import { createKeyRing, decryptJSON, deriveVaultKey, encryptJSON, PBKDF2_ITERATIONS, randomBytes, type KeyRing } from "./crypto";
import type { HEvent } from "./events";

export interface EventStore {
  readonly persistent: boolean;
  append(events: HEvent[]): Promise<void>;
  all(): Promise<HEvent[]>;
  keyRing(): Promise<KeyRing>;
}

interface EventRow { seq?: number; iv: Uint8Array; ct: Uint8Array }
interface MetaRow { key: string; value: unknown }

export class AsclepiusDB extends Dexie {
  events!: Table<EventRow, number>;
  meta!: Table<MetaRow, string>;
  // On-disk name kept from before the rename so existing vaults still open.
  constructor(name = "hygiea") {
    super(name);
    this.version(1).stores({ events: "++seq", meta: "key" });
  }
}

// Kept from before the rename: changing it would make existing vaults reject the right passphrase.
const VERIFIER = "HYGIEA-VAULT-v1";

interface VaultMeta { salt: Uint8Array; iterations: number; verifier: { iv: Uint8Array; ct: Uint8Array } }

export class WrongPassphraseError extends Error {
  constructor() { super("Wrong passphrase"); }
}

export async function hasVault(db: AsclepiusDB): Promise<boolean> {
  return !!(await db.meta.get("vault"));
}

export async function createVault(db: AsclepiusDB, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<VaultStore> {
  if (await hasVault(db)) throw new Error("A vault already exists on this device");
  const salt = randomBytes(16);
  const key = await deriveVaultKey(passphrase, salt, iterations);
  const verifier = await encryptJSON(key, VERIFIER);
  await db.meta.put({ key: "vault", value: { salt, iterations, verifier } satisfies VaultMeta });
  const ring = await createKeyRing();
  await db.meta.put({ key: "keyring", value: await encryptJSON(key, ring) });
  return new VaultStore(db, key);
}

export async function openVault(db: AsclepiusDB, passphrase: string): Promise<VaultStore> {
  const row = await db.meta.get("vault");
  if (!row) throw new Error("No vault on this device");
  const m = row.value as VaultMeta;
  const key = await deriveVaultKey(passphrase, m.salt, m.iterations);
  try {
    const v = await decryptJSON<string>(key, m.verifier);
    if (v !== VERIFIER) throw new WrongPassphraseError();
  } catch {
    throw new WrongPassphraseError();
  }
  return new VaultStore(db, key);
}

export async function destroyVault(db: AsclepiusDB): Promise<void> {
  await db.transaction("rw", db.events, db.meta, async () => {
    await db.events.clear();
    await db.meta.clear();
  });
}

export class VaultStore implements EventStore {
  readonly persistent = true;
  private ring?: KeyRing;
  private db: AsclepiusDB;
  private key: CryptoKey;
  constructor(db: AsclepiusDB, key: CryptoKey) {
    this.db = db;
    this.key = key;
  }

  async append(events: HEvent[]): Promise<void> {
    const rows = await Promise.all(events.map((e) => encryptJSON(this.key, e)));
    await this.db.events.bulkAdd(rows);
  }

  async all(): Promise<HEvent[]> {
    const rows = await this.db.events.orderBy("seq").toArray();
    return Promise.all(rows.map((r) => decryptJSON<HEvent>(this.key, r)));
  }

  async keyRing(): Promise<KeyRing> {
    if (this.ring) return this.ring;
    const row = await this.db.meta.get("keyring");
    this.ring = await decryptJSON<KeyRing>(this.key, row!.value as { iv: Uint8Array; ct: Uint8Array });
    return this.ring;
  }

  /** Raw (still encrypted) rows, for showing that data at rest is unreadable. */
  async rawSample(n = 1): Promise<EventRow[]> {
    return this.db.events.limit(n).toArray();
  }
}

export class MemoryStore implements EventStore {
  readonly persistent = false;
  private events: HEvent[] = [];
  private ring?: Promise<KeyRing>;
  async append(events: HEvent[]): Promise<void> {
    this.events.push(...structuredClone(events));
  }
  async all(): Promise<HEvent[]> {
    return structuredClone(this.events);
  }
  keyRing(): Promise<KeyRing> {
    this.ring ??= createKeyRing();
    return this.ring;
  }
}

/** Ask the browser not to evict our data when space is low (NFR-08). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
