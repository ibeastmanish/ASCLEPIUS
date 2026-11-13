import { RULES } from "../engine/rules";
import { formatDuration, type Autonomy, type ReplyClock } from "../engine/replyclock";
import { G } from "./ui";

const LEVEL: Record<Autonomy, { word: string; glyph: keyof typeof G; cls: string }> = {
  "earth-guided": { word: "Earth guides", glyph: "check", cls: "rc-guided" },
  "earth-consulted": { word: "Act, Earth confirms", glyph: "arrow", cls: "rc-consulted" },
  "crew-decides": { word: "Crew decides", glyph: "alert", cls: "rc-crew" },
};

/** Who decides, from WHEN YOU MUST ACT vs WHEN EARTH'S ANSWER CAN ARRIVE (PRD v3 Pillar A). */
export function ReplyClockCard({ clock, compact }: { clock: ReplyClock; compact?: boolean }) {
  const l = LEVEL[clock.level];
  const word = clock.far === "Earth" ? l.word : l.word.replace("Earth", cap(clock.far));
  const reply = clock.earliestReplyMin;
  const scale = Math.max(clock.actWithinMin, Number.isFinite(reply) ? reply : clock.actWithinMin * 1.6) * 1.12;
  const actPct = (clock.actWithinMin / scale) * 100;
  const replyPct = Number.isFinite(reply) ? Math.min(100, (reply / scale) * 100) : 100;
  const late = !Number.isFinite(reply) || reply >= clock.actWithinMin;

  return (
    <section className={`rc ${l.cls}${compact ? " rc-compact" : ""}`} aria-label="Earth Reply Clock">
      <div className="rc-head">
        <span className="label">Earth Reply Clock</span>
        <span className="rc-level"><span className="rc-glyph" aria-hidden="true">{G[l.glyph]}</span>{word}</span>
      </div>
      <p className="rc-sentence">{clock.sentence}</p>

      <div className="rc-track" role="img"
        aria-label={`Act within ${formatDuration(clock.actWithinMin)}. ${cap(clock.far)}'s earliest answer in ${formatDuration(reply)}.`}>
        <div className="rc-bar" />
        {late && <div className="rc-gap" style={{ left: `${actPct}%`, width: `${replyPct - actPct}%` }} />}
        <span className="rc-mark rc-now" style={{ left: "0%" }}><i />Now</span>
        <span className="rc-mark rc-act" style={{ left: `${actPct}%` }}><i />Act by · {formatDuration(clock.actWithinMin)}</span>
        <span className={`rc-mark rc-reply${replyPct > 70 ? " rc-right" : ""}`} style={{ left: `${replyPct}%` }}><i />{cap(clock.far)} answers · {formatDuration(reply)}</span>
      </div>

      {!compact && (
        <details className="rc-how">
          <summary>How this is worked out</summary>
          <ol>
            {clock.steps.map((s, k) => (
              <li key={k}>
                <span>{s.label}{s.assumed && <span className="rc-assumed">assumption</span>}</span>
                <b>{formatDuration(s.min)}</b>
                <small>{s.source}</small>
              </li>
            ))}
            <li className="rc-total"><span>Earliest answer back at the crew</span><b>{formatDuration(reply)}</b></li>
            <li><span>Must act within</span><b>{formatDuration(clock.actWithinMin)}</b><small>{clock.actBasis}. {RULES.replyClock.actSource}</small></li>
          </ol>
          <p className="small muted">
            {clock.marsLocal && <>Mars local {clock.marsLocal} · </>}Houston {clock.houstonLocal}
            {clock.estimated && <> · date outside the cached JPL Horizons table, nearest day used</>}
            . Earth answers if it can reply in under half the time you have; you start and Earth confirms if it can reply in time; otherwise the crew decides.
            Idea: {RULES.replyClock.concept}
          </p>
        </details>
      )}
    </section>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
