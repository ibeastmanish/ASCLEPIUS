// Bridge to the desktop build's Rust side (src-tauri), which wraps Hermes `aura` OpenPGP.
// In the web build none of this is called: inDesktopApp() is false.
import { invoke } from "@tauri-apps/api/core";
import { fromB64, toB64 } from "./crypto";

export interface HermesStatus {
  unlocked: boolean;
  created: boolean;
  alg: string;
  crewFingerprint?: string;
  groundFingerprint?: string;
  groundSimulated: boolean;
}

export interface AppMode {
  selftest: boolean;
  desktop: boolean;
  version: string;
}

/** True inside the Tauri desktop app. */
export function inDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const hermes = {
  unlock: (passphrase: string, create: boolean) => invoke<HermesStatus>("hermes_unlock", { passphrase, create }),
  lock: () => invoke<void>("hermes_lock"),
  status: () => invoke<HermesStatus>("hermes_status"),
  /** Sign with the crew key, encrypt to the flight surgeon key. */
  seal: async (body: Uint8Array) => fromB64(await invoke<string>("hermes_seal", { body: toB64(body) })),
  /** Decrypt with the flight surgeon key and check the crew signature. Throws if tampered. */
  open: async (sealed: Uint8Array) => fromB64(await invoke<string>("hermes_open", { payload: toB64(sealed) })),
  erase: () => invoke<void>("hermes_erase"),
  mode: () => invoke<AppMode>("app_mode"),
  selftestLog: (line: string) => invoke<void>("selftest_log", { line }).catch(() => undefined),
  selftestDone:(ok: boolean, report: unknown) => invoke<void>("selftest_done", { ok, report }),
};
