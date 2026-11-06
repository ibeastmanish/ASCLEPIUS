import { utcHM } from "../app/clock";
import { fmtMinutes } from "./ui";


/** Sent → Earth receives → earliest reply, from the light delay alone (the physics minimum). */
export function LinkTimeline({ sentMs, oneWayMin, compact }: { sentMs: number; oneWayMin: number; compact?: boolean }) {
  const hop = oneWayMin * 60_000;
  const steps = [
    { label: "Sent from Mars", at: sentMs },
    { label: "Earth receives", at: sentMs + hop },
    { label: "Earliest doctor reply", at: sentMs + 2 * hop },
  ];
  return (
    <div className={`link-timeline${compact ? " compact" : ""}`} role="group" aria-label="Message timeline">
      {steps.map((s, i) => (
        <div className="lt-step" key={s.label}>
          {i > 0 && <span className="lt-hop" aria-hidden="true">+{fmtMinutes(oneWayMin)}</span>}
          <span className="lt-label">{s.label}</span>
          <b className="lt-time">{utcHM(s.at)}</b>
        </div>
      ))}
    </div>
  );
}
