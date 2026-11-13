// Desktop self-test (ASCLEPIUS_SELFTEST=1 npm run desktop:selftest).
// Runs the real app code inside the real desktop webview, with no network:
// vault (IndexedDB + WebCrypto) → engine worker → Hermes OpenPGP seal → ground open → tamper.
// Uses its own database and a temporary key folder; the user's data is never touched.
import { ASHA_TODAY, ashaEvents } from "../seed/asha";
import { fromB64, toB64 } from "../storage/crypto";
import { open, setHermesReady } from "../storage/earthlink";
import type { OutboxMessage } from "../storage/events";
import { hermes } from "../storage/hermes";
import { project } from "../storage/projection";
import { createVault, destroyVault, AsclepiusDB } from "../storage/store";
import { missionDay } from "./clock";
import { runCheck } from "./record";

interface Step { name: string; ok: boolean; ms: number; detail?: unknown }

/** Keep the report JSON-safe: objects like the vault store are named, not serialized. */
function plain(v: unknown): unknown {
  try {
    JSON.stringify(v);
    return v;
  } catch {
    return (v as object)?.constructor?.name ?? typeof v;
  }
}

export async function runSelfTest(): Promise<void> {
  const steps: Step[] = [];
  const step = async <T>(name: string, fn: () => Promise<T> | T): Promise<T | undefined> => {
    const t = performance.now();
    void hermes.selftestLog(`start ${name}`);
    try {
      const detail = await fn();
      steps.push({ name, ok: true, ms: Math.round(performance.now() - t), detail: plain(detail) });
      void hermes.selftestLog(`ok ${name}`);
      return detail;
    } catch (e) {
      steps.push({ name, ok: false, ms: Math.round(performance.now() - t), detail: String((e as Error)?.message ?? e) });
      void hermes.selftestLog(`FAIL ${name}: ${String((e as Error)?.message ?? e)}`);
      return undefined;
    }
  };
  const expect = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  const pass = "selftest passphrase";
  const date = "2026-11-14";
  const db = new AsclepiusDB("asclepius-selftest");

  await step("secure context and WebCrypto", () => {
    expect(isSecureContext && crypto?.subtle, "WebCrypto is not available");
    return location.origin;
  });
  const vault = await step("encrypted vault in IndexedDB", async () => {
    await destroyVault(db).catch(() => undefined);
    return createVault(db, pass);
  });
  const status = await step("Hermes keys (create_identity + vault)", async () => {
    const s = await hermes.unlock(pass, true);
    expect(s.unlocked && s.crewFingerprint && s.groundFingerprint, "keys missing");
    setHermesReady(true);
    return s;
  });

  const messages: OutboxMessage[] = [];
  if (vault && status) {
    await step("seed simulated crew member", async () => {
      await vault.append(ashaEvents(date));
      return (await vault.all()).length;
    });
    for (const [label, values, want] of [
      ["J3 check (engine worker)", ASHA_TODAY, "yellow"],
      ["red check (glucose 48)", { ...ASHA_TODAY, glucose: 48 }, "red"],
    ] as const) {
      await step(label, async () => {
        const state = project(await vault.all());
        const ts = new Date(`${date}T07:${messages.length ? "40" : "10"}:00`);
        const { result, events } = await runCheck(state, { values, tags: [], symptoms: [], input: "tapped" }, ts, date, missionDay(state.profile, date), await vault.keyRing());
        await vault.append(events);
        expect(result.overall === want, `expected ${want}, got ${result.overall}`);
        const queued = events.flatMap((e) => (e.type === "MessageQueued" ? [e.message] : []));
        expect(queued.length > 0, "no Earth message queued");
        expect(queued.every((m) => m.alg === "hermes"), `sealed with ${queued.map((m) => m.alg).join(",")}, not Hermes`);
        messages.push(...queued);
        return { overall: result.overall, escalation: result.escalation, queued: queued.map((m) => `${m.kind}:${m.bytes}B`) };
      });
    }
  }

  const ring = vault ? await vault.keyRing() : null;
  if (ring && messages.length) {
    await step("ground opens and verifies every message", async () => {
      const out = [];
      for (const m of messages) {
        const s = (await open(m.payload, ring)) as Record<string, unknown>;
        expect(s.overall === m.summary.overall && s.day === m.summary.day, "summary mismatch");
        out.push(`${m.kind}:${s.overall}`);
      }
      return out;
    });
    await step("one flipped bit is rejected", async () => {
      const b = fromB64(messages[0].payload);
      b[b.length - 8] ^= 0x20; // same as the Outbox tamper test
      try {
        await open(toB64(b), ring);
      } catch (e) {
        return `rejected: ${String((e as Error).message ?? e)}`;
      }
      throw new Error("tampered message was accepted");
    });
  }

  await step("clean up (vault + keys)", async () => {
    await destroyVault(db);
    await hermes.erase();
    setHermesReady(false);
    return "removed";
  });

  const ok = steps.every((s) => s.ok);
  await hermes.selftestDone(ok, { userAgent: navigator.userAgent, steps, crewFingerprint: status?.crewFingerprint });
}
