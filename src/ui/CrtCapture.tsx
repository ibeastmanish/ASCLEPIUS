// Capillary refill (CRT) capture: camera auto-timer, or a manual stopwatch
// fallback when there is no camera, permission is refused, or the astronaut
// just prefers to tap. Either path ends the same way: one number in seconds,
// fed into the normal engine pipeline like every other indicator.
import { useEffect, useRef, useState } from "react";
import { estimateCapillaryRefill, type BrightnessSample } from "../engine/crt";
import { G } from "./ui";

type Mode = "idle" | "camera-armed" | "camera-recording" | "camera-done" | "camera-error" | "manual-armed" | "manual-timing" | "manual-done";

const SAMPLE_HZ = 15;
const MAX_RECORD_MS = 9000;
const SAMPLE_SIDE = 48; // downscaled square region read from the video frame

export function CrtCapture({ onResult }: { onResult: (seconds: number | undefined) => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [seconds, setSeconds] = useState<number | undefined>(undefined);
  const [message, setMessage] = useState<string>("");
  const [cameraSupported] = useState(() => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samplesRef = useRef<BrightnessSample[]>([]);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const lastSampleRef = useRef(0);
  const manualStartRef = useRef(0);

  function stopCamera() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stopCamera, []);

  async function startCamera() {
    setMessage("");
    setMode("camera-armed");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      // Best-effort torch on; many devices/browsers don't support it, that's fine.
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.();
        if (caps && "torch" in caps) await track.applyConstraints({ advanced: [{ torch: true } as unknown as MediaTrackConstraintSet] });
      } catch { /* no torch control; proceed without it */ }

      samplesRef.current = [];
      startedRef.current = performance.now();
      lastSampleRef.current = 0;
      setMode("camera-recording");
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setMode("camera-error");
      setMessage("Couldn't reach the camera. Use the manual stopwatch instead.");
    }
  }

  function tick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const now = performance.now() - startedRef.current;
    if (now - lastSampleRef.current >= 1000 / SAMPLE_HZ) {
      lastSampleRef.current = now;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE);
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIDE, SAMPLE_SIDE);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const brightness = sum / (data.length / 4);
        samplesRef.current.push({ t: now, brightness });
      }
    }
    if (now < MAX_RECORD_MS) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      finishCamera();
    }
  }

  function finishCamera() {
    stopCamera();
    const r = estimateCapillaryRefill(samplesRef.current);
    if (r.confidence === "ok") {
      setSeconds(r.seconds);
      onResult(r.seconds);
      setMode("camera-done");
    } else {
      const why = r.confidence === "low-contrast" ? "The reading was too faint to time clearly." : "Didn't catch the moment your finger lifted off the lens.";
      setMessage(`${why} Try again with a firm press and good light, or use the manual stopwatch.`);
      setMode("camera-error");
    }
  }

  function startManual() {
    setMode("manual-armed");
    setMessage("");
  }
  function pressManual() {
    manualStartRef.current = performance.now();
    setMode("manual-timing");
  }
  function releaseManual() {
    const s = (performance.now() - manualStartRef.current) / 1000;
    setSeconds(s);
    onResult(s);
    setMode("manual-done");
  }

  function reset() {
    setSeconds(undefined);
    setMessage("");
    onResult(undefined);
    setMode("idle");
  }

  return (
    <div className="crt-capture">
      {(mode === "camera-armed" || mode === "camera-recording") && (
        <>
          <video ref={videoRef} muted playsInline style={{ width: 120, height: 90, borderRadius: 8, background: "#000" }} />
          <canvas ref={canvasRef} width={SAMPLE_SIDE} height={SAMPLE_SIDE} style={{ display: "none" }} />
        </>
      )}

      {mode === "idle" && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {cameraSupported && (
            <button className="btn" onClick={() => void startCamera()}>
              <span aria-hidden="true">{G.info}</span> Start camera check
            </button>
          )}
          <button className="btn" onClick={startManual}>Use manual stopwatch</button>
        </div>
      )}

      {mode === "camera-armed" && <p className="small muted">Opening the camera…</p>}

      {mode === "camera-recording" && (
        <p className="small">
          Press a fingertip firmly over the camera lens for 5 seconds, then move it just clear of the lens.
          Timing for up to {Math.round(MAX_RECORD_MS / 1000)} s…
        </p>
      )}

      {mode === "camera-error" && (
        <>
          <p className="tile-msg invalid" role="alert">{message}</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => void startCamera()}>Try camera again</button>
            <button className="btn" onClick={startManual}>Use manual stopwatch</button>
          </div>
        </>
      )}

      {mode === "manual-armed" && (
        <>
          <p className="small">Press and hold a fingertip firmly for 5 seconds. Tap "Release" the instant you let go.</p>
          <button className="btn btn-primary" onClick={pressManual}>Release</button>
        </>
      )}

      {mode === "manual-timing" && (
        <>
          <p className="small">Watch the fingertip. Tap the moment it looks pink again.</p>
          <button className="btn btn-primary" onClick={releaseManual}>Pink again</button>
        </>
      )}

      {(mode === "camera-done" || mode === "manual-done") && seconds !== undefined && (
        <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
          <span className="value">{seconds.toFixed(1)} s</span>
          <button className="icon-btn" aria-label="Retest" onClick={reset}>Retest</button>
        </div>
      )}
    </div>
  );
}
