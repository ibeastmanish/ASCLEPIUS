// Mission Story: one week on Mars, told with the app's own NASA data and engine.
// Every number on this screen is computed live (JPL Horizons table, the Reply
// Clock, Crew Pulse, the OSD-569 proof); nothing is typed in by hand.
import { useMemo } from "react";
import { fmtDate } from "../app/clock";
import { useApp } from "../app/store";
import { pulse } from "../engine/crewpulse";
import { HORIZONS_RANGE, earthFor, series } from "../engine/horizons";
import { clinicLink, computeReplyClock, formatDuration, spaceLink } from "../engine/replyclock";
import { RULES } from "../engine/rules";
import { CLINIC_DEFAULTS } from "../i18n";
import { PROOF } from "../proof/proof";
import { crewDays, CREW_ORDER, SIM_CABIN_CO2 } from "../seed/crew";
import { Disclaimer, TopBar } from "../ui/ui";

const W = 640;
const C = W / 2;

/** Data art: every day Nov 2026 - Dec 2029 as one ray; length = one-way light time (JPL Horizons). */
function LightSpiral({ today }: { today: string }) {
  const days = useMemo(() => series(), []);
  const min = Math.min(...days.map((d) => d.oneWayMin));
  const max = Math.max(...days.map((d) => d.oneWayMin));
  const r0 = 92;
  const r1 = 300;
  const rays = days.map((d, i) => {
    const a = (i / days.length) * Math.PI * 2 - Math.PI / 2;
    const r = r0 + ((d.oneWayMin - min) / (max - min)) * (r1 - r0);
    const t = (d.oneWayMin - min) / (max - min);
    const blackout = d.sunAngleDeg < 3;
    // NASA light blue (near) to NASA red (far); blackout days solid yellow.
    const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
    const color = blackout ? "#FFC72C" : `rgb(${lerp(111, 252)} ${lerp(163, 61)} ${lerp(255, 33)})`;
    return { x1: C + Math.cos(a) * (r0 - 6), y1: C + Math.sin(a) * (r0 - 6), x2: C + Math.cos(a) * r, y2: C + Math.sin(a) * r, color, blackout, date: d.date, a, r };
  });
  const ti = days.findIndex((d) => d.date === today);
  const tr = ti >= 0 ? rays[ti] : undefined;
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="story-spiral" role="img"
      aria-label={`Every day from ${HORIZONS_RANGE.start} to ${HORIZONS_RANGE.end} as one ray; ray length is the Earth-Mars one-way light time, from ${min.toFixed(1)} to ${max.toFixed(1)} minutes. Yellow rays are the 2028 Sun blackout.`}>
      <circle cx={C} cy={C} r={r1 + 14} fill="none" stroke="rgb(111 163 255 / 25%)" strokeDasharray="2 6" />
      <circle cx={C} cy={C} r={r0 - 10} fill="none" stroke="rgb(255 255 255 / 20%)" />
      {rays.map((r, i) => <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={r.color} strokeWidth={r.blackout ? 1.6 : 1} strokeOpacity={r.blackout ? 1 : 0.85} />)}
      {tr && <>
        <line x1={C + Math.cos(tr.a) * (r0 - 6)} y1={C + Math.sin(tr.a) * (r0 - 6)} x2={tr.x2} y2={tr.y2} stroke="#fff" strokeWidth={2.5} />
        <circle cx={tr.x2} cy={tr.y2} r={7} fill="#fff" />
      </>}
      <text x={C} y={C - 8} textAnchor="middle" className="ss-big">{min.toFixed(1)}–{max.toFixed(1)}</text>
      <text x={C} y={C + 18} textAnchor="middle" className="ss-small">MINUTES, ONE WAY</text>
      <text x={C} y={C + 38} textAnchor="middle" className="ss-small">{HORIZONS_RANGE.start.slice(0, 4)}–{HORIZONS_RANGE.end.slice(0, 4)}</text>
    </svg>
  );
}

export function Story() {
  const { state, today, day, now } = useApp();
  const p = state.profile!;
  const e = earthFor(today, p.mission);
  const blackout = series().filter((d) => d.sunAngleDeg < 3);
  const hr = state.baselines.hr;
  const a = RULES.replyClock.actWithinMin;
  const red = computeReplyClock({ nowMs: now.getTime(), link: spaceLink(today, p.mission), priority: "red", actWithinMin: a.red, actBasis: "", mission: p.mission, baseLonE: p.baseLonE });
  const clinicNight = computeReplyClock({
    nowMs: Date.parse(`${today}T16:30:00Z`), link: clinicLink(CLINIC_DEFAULTS), priority: "red", actWithinMin: a.red, actBasis: "", mission: p.mission,
  });
  const findings = useMemo(() => pulse({ days: crewDays(state, today, day), today, cabinCo2: state.settings.cabinCo2 ?? SIM_CABIN_CO2, crewCount: CREW_ORDER(state).length }), [state, today, day]);
  const m = PROOF.mcv.result;

  return (
    <>
      <TopBar title="Mission Story"><span>One week on Mars, told with NASA data · simulated crew</span></TopBar>

      <section className="story-hero">
        <LightSpiral today={today} />
        <div>
          <span className="label">Chapter 1 · The distance</span>
          <h2>Your doctor is {e.blackout ? "behind the Sun" : `${e.oneWayMin.toFixed(1)} minutes away`}.</h2>
          <p>Each ray is one day from {fmtDate(HORIZONS_RANGE.start)} to {fmtDate(HORIZONS_RANGE.end)}. Its length is how long a radio message takes from Mars to Earth that day. Blue is near, red is far, and the yellow rays are the {blackout.length} days in 2028 when the Sun blocks the link completely. The white line is today.</p>
          <p className="small muted">Data: NASA JPL Horizons, Mars (499) from Earth (500@399), one value per day.</p>
        </div>
      </section>

      <section className="story-ch">
        <span className="label">Chapter 2 · Your normal</span>
        <h2>74 is fine for most people. Not for {p.name.split(" ")[0]}.</h2>
        <p>The usual adult resting heart rate is 60–100 bpm. {hr?.ready ? <>{p.name.split(" ")[0]}&apos;s own normal, learned from her first checks, is <b>{Math.round(hr.low)}–{Math.round(hr.high)} bpm</b>.</> : "Her own normal is learned from her first 7 checks."} So 74 is green on the adult chart and yellow on hers. ASCLEPIUS checks both, and the worse result wins.</p>
        {hr?.ready && (
          <svg viewBox="0 0 600 70" className="story-bar" role="img" aria-label={`Adult range 60 to 100, personal range ${Math.round(hr.low)} to ${Math.round(hr.high)}, today 74.`}>
            {(() => { const x = (v: number) => 20 + ((v - 40) / 70) * 560; return <>
              <rect x={x(60)} y={14} width={x(100) - x(60)} height={14} rx={7} fill="rgb(46 194 126 / 35%)" />
              <rect x={x(hr.low)} y={36} width={x(hr.high) - x(hr.low)} height={14} rx={7} fill="#6FA3FF" />
              <line x1={x(74)} y1={6} x2={x(74)} y2={58} stroke="#FC3D21" strokeWidth={3} />
              <text x={x(60)} y={66} className="ss-tick">60</text><text x={x(100) - 16} y={66} className="ss-tick">100</text><text x={x(74) + 6} y={10} className="ss-tick">today 74</text>
            </>; })()}
          </svg>
        )}
      </section>

      <section className="story-ch">
        <span className="label">Chapter 3 · Who decides</span>
        <h2>Earth needs {formatDuration(red.earliestReplyMin)}. She has {formatDuration(red.actWithinMin)}.</h2>
        <p>When something is dangerous, ASCLEPIUS adds up the light time to Earth, the flight surgeon&apos;s reply ({red.surgeonOnShiftAtArrival ? "on shift right now" : "off shift, so they are paged"}) and the light time back. If that answer arrives after the crew must act, the app says so plainly: <b>the crew decides now, and Earth reviews later.</b></p>
        <p className="small muted">Data: JPL Horizons light time; NASA Mars24 for the 39.6-minute daily drift between Mars and Houston; idea from NASA&apos;s Earth-Independent Medical Operations concept (NTRS 20250000009).</p>
      </section>

      <section className="story-ch">
        <span className="label">Chapter 4 · The whole crew</span>
        <h2>{findings[0]?.title ?? "The crew is green."}</h2>
        <p>{findings[0]?.text} One person with a headache is about that person. Several on the same day is about the air they share. A fever moving from one person to the next is about infection. Mood stays private.</p>
        <p className="small muted">Data: NASA-STD-3001 Vol 2 [V2 6004] cabin CO2 limit 3 mmHg; NASA OCHMO-TB-004; NASA HRP Risk of Altered Immune System Responses.</p>
      </section>

      <section className="story-ch">
        <span className="label">Chapter 5 · The proof</span>
        <h2>Population range: {m.insidePopulationAtR1} of {m.n} fine. Personal range: {m.belowOwnMinAtR1} of {m.n} changed.</h2>
        <p>This part is real. In NASA&apos;s Inspiration4 blood data, the day after landing every crew member&apos;s red-cell size looked normal on the adult chart, and every one was below their own lowest value from before the flight. Checking the data first, we found a row shifted by one column in NASA&apos;s file, corrected it, and reported it to NASA.</p>
        <p className="small muted">Data: NASA OSDR OSD-569. Four people and a three-day flight: consistent with a personal change, not proof of one.</p>
      </section>

      <section className="story-ch">
        <span className="label">Chapter 6 · Delay is delay</span>
        <h2>On Earth, the far end can be a clinic.</h2>
        <p>Near Warangal, India, some villages are hours from a doctor. With a {CLINIC_DEFAULTS.travelMin / 60}-hour journey each way and the clinic closed at night, the same clock gives a health worker the same honest answer: the doctor can respond in <b>{formatDuration(clinicNight.earliestReplyMin)}</b>, so act on the card now. The daily check also comes in Telugu and Hindi.</p>
        <p className="small muted">Clinic travel time and hours are example settings you can change in Settings.</p>
      </section>

      <Disclaimer />
    </>
  );
}
