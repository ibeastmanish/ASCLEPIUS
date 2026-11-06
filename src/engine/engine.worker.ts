/// <reference lib="webworker" />
// Engine Web Worker: all evaluation runs off the UI thread.
import { completeCheck, evaluateReading } from "./evaluate";
import type { EngineRequest, EngineResponse } from "./client";

self.onmessage = (ev: MessageEvent<EngineRequest>) => {
  const req = ev.data;
  const t0 = performance.now();
  let res: EngineResponse;
  try {
    const result = req.op === "evaluateReading"
      ? evaluateReading(req.args.indicator, req.args.value, req.args.opts)
      : completeCheck(req.args.input, req.args.ctx);
    res = { id: req.id, ok: true, result, ms: performance.now() - t0 };
  } catch (e) {
    res = { id: req.id, ok: false, error: String(e), ms: performance.now() - t0 };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res);
};
