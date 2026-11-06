// Small promise API over the engine worker: evaluateReading, completeCheck.
// Falls back to calling the same pure functions directly when Workers are
// unavailable (tests, very old browsers), so results are identical.
import { completeCheck as directComplete, evaluateReading as directEvaluate } from "./evaluate";
import type { Baselines, CheckInput, CheckResult, ContextTag, DayRecord, EngineContext, Indicator, IndicatorResult } from "./types";

type EvalOpts = { tags?: ContextTag[]; baselines?: Baselines; history?: DayRecord[]; date?: string };

export type EngineRequest =
  | { id: number; op: "evaluateReading"; args: { indicator: Indicator; value: number; opts: EvalOpts } }
  | { id: number; op: "completeCheck"; args: { input: CheckInput; ctx: EngineContext } };

export type EngineResponse =
  | { id: number; ok: true; result: IndicatorResult | CheckResult; ms: number }
  | { id: number; ok: false; error: string; ms: number };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
export const lastTiming = { ms: 0 };

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<EngineResponse>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      lastTiming.ms = ev.data.ms;
      if (ev.data.ok) p.resolve(ev.data.result);
      else p.reject(new Error(ev.data.error));
    };
    worker.onerror = () => {
      // Worker failed to start: fall back to direct calls for everything pending.
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

function call<T>(req: Omit<EngineRequest, "id">, direct: () => T): Promise<T> {
  const w = getWorker();
  if (!w) {
    const t0 = performance.now();
    const r = direct();
    lastTiming.ms = performance.now() - t0;
    return Promise.resolve(r);
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ ...req, id });
  });
}

export function evaluateReading(indicator: Indicator, value: number, opts: EvalOpts): Promise<IndicatorResult> {
  return call({ op: "evaluateReading", args: { indicator, value, opts } } as Omit<EngineRequest, "id">,
    () => directEvaluate(indicator, value, opts));
}

export function completeCheck(input: CheckInput, ctx: EngineContext): Promise<CheckResult> {
  return call({ op: "completeCheck", args: { input, ctx } } as Omit<EngineRequest, "id">,
    () => directComplete(input, ctx));
}
