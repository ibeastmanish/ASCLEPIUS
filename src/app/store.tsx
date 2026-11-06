import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CheckResult } from "../engine/types";
import { ashaEvents } from "../seed/asha";
import type { HEvent, Profile, Settings } from "../storage/events";
import { project, type AppState } from "../storage/projection";
import {
  createVault, destroyVault, hasVault, HygieaDB, MemoryStore, openVault, requestPersistence, VaultStore, type EventStore,
} from "../storage/store";
import { setHermesReady } from "../storage/earthlink";
import { hermes, inDesktopApp, type HermesStatus } from "../storage/hermes";
import { missionDay, missionNow, missionToday } from "./clock";
import { runCheck, type Draft } from "./record";

/**
 * Desktop build only: unlock the Hermes OpenPGP keys with the same passphrase as the vault.
 * The vault has already proved the passphrase, so if saved keys don't open (they belong to an
 * earlier, erased vault) new ones are made. Returns null in the web build or if Hermes fails;
 * Earth messages then use WebCrypto.
 */
async function startHermes(passphrase: string, fresh: boolean): Promise<HermesStatus | null> {
  if (!inDesktopApp()) return null;
  try {
    const s = await hermes.unlock(passphrase, fresh).catch(() => hermes.unlock(passphrase, true));
    setHermesReady(true);
    return s;
  } catch (e) {
    console.warn("Hermes unavailable; Earth messages will use WebCrypto", e);
    setHermesReady(false);
    return null;
  }
}

export type Phase = "loading" | "setup" | "locked" | "ready";

export interface App {
  phase: Phase;
  state: AppState;
  store: EventStore | null;
  now: Date;
  today: string;
  day: number;
  video: string | null;
  busy: string | null;
  lastResult: CheckResult | null;
  /** Hermes OpenPGP key status (desktop build); null in the web build. */
  security: HermesStatus | null;
  setup(passphrase: string, profile: Profile | "asha"): Promise<void>;
  unlock(passphrase: string): Promise<boolean>;
  lock(): void;
  submit(draft: Draft): Promise<CheckResult>;
  setSettings(s: Partial<Settings>): Promise<void>;
  setProfile(p: Profile): Promise<void>;
  erase(): Promise<void>;
  events(): Promise<HEvent[]>;
}

const Ctx = createContext<App | null>(null);
const db = new HygieaDB();
const EMPTY = project([]);

export const VIDEO_DATE = "2026-11-14";

// Video-mode scripts submit a demo check once. React StrictMode runs effects twice in development,
// which used to queue every demo message twice; this guard keeps it to one per page load.
const videoRan = new Set<string>();
export function videoOnce(key: string): boolean {
  if (videoRan.has(key)) return false;
  videoRan.add(key);
  return true;
}

function params() {
  const p = new URLSearchParams(location.search);
  return { video: p.get("video"), seed: p.get("seed") };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [store, setStore] = useState<EventStore | null>(null);
  const [state, setState] = useState<AppState>(EMPTY);
  const [real, setReal] = useState(() => new Date());
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CheckResult | null>(null);
  const [security, setSecurity] = useState<HermesStatus | null>(null);
  const [video] = useState(() => params().video);

  // Clock tick, for countdowns and the outbox.
  useEffect(() => {
    const t = setInterval(() => setReal(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async (s: EventStore) => {
    setState(project(await s.all()));
  }, []);

  useEffect(() => {
    (async () => {
      if (video) {
        // Video mode: simulated persona only, nothing stored (VIDEO_PRD section 9).
        const m = new MemoryStore();
        await m.append(ashaEvents(VIDEO_DATE));
        await m.append([{ type: "SettingsChanged", ts: new Date().toISOString(), settings: { dateOverride: VIDEO_DATE } }]);
        setStore(m);
        await refresh(m);
        setPhase("ready");
        return;
      }
      setPhase((await hasVault(db)) ? "locked" : "setup");
    })();
  }, [video, refresh]);

  const now = useMemo(() => missionNow(state.settings, real), [state.settings, real]);
  const today = missionToday(state.settings, real);
  const day = missionDay(state.profile, today);

  const append = useCallback(async (events: HEvent[]) => {
    if (!store) throw new Error("Vault is locked");
    await store.append(events);
    await refresh(store);
  }, [store, refresh]);

  const app: App = {
    phase, state, store, now, today, day, video, busy, lastResult, security,

    async setup(passphrase, profile) {
      setBusy("Securing your Health Vault…");
      try {
        const v = await createVault(db, passphrase);
        void requestPersistence();
        if (inDesktopApp()) setBusy("Creating Hermes OpenPGP keys…");
        setSecurity(await startHermes(passphrase, true));
        if (profile === "asha") {
          setBusy("Loading simulated crew member…");
          await v.append(ashaEvents(missionToday({ reminderHour: 7 })));
        } else {
          await v.append([{ type: "ProfileSet", ts: new Date().toISOString(), profile }]);
        }
        setStore(v);
        await refresh(v);
        setPhase("ready");
      } finally {
        setBusy(null);
      }
    },

    async unlock(passphrase) {
      setBusy("Unlocking…");
      try {
        const v = await openVault(db, passphrase);
        setSecurity(await startHermes(passphrase, false));
        setStore(v);
        await refresh(v);
        setPhase("ready");
        return true;
      } catch {
        return false;
      } finally {
        setBusy(null);
      }
    },

    lock() {
      if (inDesktopApp()) void hermes.lock().catch(() => undefined);
      setHermesReady(false);
      setSecurity(null);
      setStore(null);
      setState(EMPTY);
      setLastResult(null);
      setPhase(video ? "ready" : "locked");
    },

    async submit(draft) {
      if (!store) throw new Error("Vault is locked");
      const { result, events } = await runCheck(state, draft, now, today, day, await store.keyRing());
      await append(events);
      setLastResult(result);
      if (result.overall === "red") notifyCmo(result);
      return result;
    },

    async setSettings(s) {
      await append([{ type: "SettingsChanged", ts: new Date().toISOString(), settings: s }]);
    },

    async setProfile(p) {
      await append([{ type: "ProfileSet", ts: new Date().toISOString(), profile: p }]);
    },

    async erase() {
      await destroyVault(db);
      if (inDesktopApp()) await hermes.erase().catch((e) => console.warn("Could not delete Hermes keys", e));
      setHermesReady(false);
      setSecurity(null);
      setStore(null);
      setState(EMPTY);
      setLastResult(null);
      setPhase("setup");
    },

    async events() {
      return store ? store.all() : [];
    },
  };

  return <Ctx.Provider value={app}>{children}</Ctx.Provider>;
}

export function useApp(): App {
  const a = useContext(Ctx);
  if (!a) throw new Error("useApp outside AppProvider");
  return a;
}

export function isVaultStore(s: EventStore | null): s is VaultStore {
  return s instanceof VaultStore;
}

/** Local CMO alert (crew sync is future work): a system notification if allowed. */
function notifyCmo(r: CheckResult) {
  try {
    if (typeof Notification === "undefined") return;
    const show = () => new Notification("HYGIEA: crew medical alert", { body: r.escalationWhy[0], tag: r.checkId });
    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default") void Notification.requestPermission().then((p) => p === "granted" && show());
  } catch {
    /* notifications are best effort; the in-app alert always shows */
  }
}
