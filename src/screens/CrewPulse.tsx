// Crew Pulse (PRD v3, Pillar B): the CMO's view across the whole crew.
// One, some, or all: an individual problem, the cabin, or something spreading.
// Mood is private and never shown here; the CMO sees colours and patterns.
import { useEffect, useMemo, useState } from "react";
import { dayLabel, fmtDate } from "../app/clock";
import { useApp, videoOnce } from "../app/store";
import { ASHA_TODAY } from "../seed/asha";
import { checksOn } from "../storage/projection";
import { cabinFlag, feverFlag, pulse, PULSE_RULES, recentDates, type CrewDay, type PulseFinding } from "../engine/crewpulse";
import type { Status } from "../engine/types";
import { CREW_ORDER, crewDays, SIM_CABIN_CO2 } from "../seed/crew";
import { Disclaimer, G, STATUS_GLYPH, StatusBadge, TopBar } from "../ui/ui";

const WORD: Record<Status | "none", string> = { green: "Good", yellow: "Check", red: "Act now", invalid: "Invalid", none: "No check" };

export function CrewPulse() {
  const app = useApp();
  const { state, today, day } = app;
  const p = state.profile!;
  const co2 = state.settings.cabinCo2 ?? (p.simulated ? SIM_CABIN_CO2 : undefined);
  const [co2Text, setCo2Text] = useState(co2 === undefined ? "" : String(co2));

  const days = useMemo(() => crewDays(state, today, day), [state, today, day]);
  const crew = CREW_ORDER(state);
  const findings = useMemo(() => pulse({ days, today, cabinCo2: co2, crewCount: crew.length }), [days, today, co2, crew.length]);
  const dates = recentDates(today, 7);

  // Video mode: Asha's J3 check first, so today's row is complete (3 of 4 crew with the cabin complaint).
  useEffect(() => {
    if (app.video !== "pulse") return;
    if (!checksOn(state, today).length && videoOnce("pulse")) void app.submit({ values: ASHA_TODAY, tags: [], symptoms: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.video]);
  const cell = (id: string, date: string) => days.find((d) => d.crew === id && d.date === date);
  const worst = findings.reduce<Status>((w, f) => (f.status === "red" ? "red" : w === "red" ? w : f.status === "yellow" ? "yellow" : w), "green");

  async function saveCo2() {
    const v = Number(co2Text);
    if (!Number.isFinite(v) || v < 0 || v > 30) return;
    await app.setSettings({ cabinCo2: Math.round(v * 10) / 10 });
  }

  return (
    <>
      <TopBar title="Crew Pulse">
        <span>CMO view · {dayLabel(day)} · {fmtDate(today)} · {crew.length} crew</span>
        <span className="tag tag-sim">Simulated crew data</span>
      </TopBar>

      <div className="answer-row">
        <StatusBadge status={worst} word={worst === "green" ? "Crew good" : worst === "yellow" ? "Look across the crew" : "Act now"} large />
        <p>One person, the cabin, or something spreading? The same yellow means different things depending on who else has it, and when.</p>
      </div>

      <section className="stack" style={{ gap: 14, marginTop: 20 }} aria-label="Crew-level findings">
        {findings.map((f) => <Finding key={f.id} f={f} crew={crew} />)}
      </section>

      <div className="chart-head" style={{ marginTop: 40 }}><h2>Last 7 sols, whole crew</h2><span className="small muted">Latest check of each sol. Colour + icon + word. Mood is private and not shown.</span></div>
      <div className="pulse-wrap">
        <table className="pulse" aria-label="Crew status by sol">
          <thead>
            <tr>
              <th scope="col">Crew</th>
              {dates.map((d) => <th key={d} scope="col" className={d === today ? "today" : ""}>{d === today ? "Today" : `Sol ${day - (dates.length - 1 - dates.indexOf(d))}`}</th>)}
            </tr>
          </thead>
          <tbody>
            {crew.map((m) => (
              <tr key={m.crew}>
                <th scope="row"><b>{m.name}</b><br /><span className="small muted">{m.role}{m.crew === p.crewId ? " · you" : ""}</span></th>
                {dates.map((d) => <Cell key={d} d={cell(m.crew, d)} today={d === today} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted pulse-legend">
        <span><span className="pf">H</span> headache</span> <span><span className="pf">F</span> fever ≥ {PULSE_RULES.feverC} °C</span>
        <span><span className="pf">Z</span> sleep &lt; {PULSE_RULES.shortSleepH} h</span> <span><span className="pf">P</span> fatigue pattern</span>
      </p>

      <section className="pulse-co2" aria-label="Cabin CO2">
        <div>
          <span className="label">Cabin CO2 (1-hour average)</span>
          <p className="small">NASA limit {PULSE_RULES.co2LimitMmHg} mmHg (NASA-STD-3001 Vol 2 Rev F [V2 6004]). Headaches are reported from 2.8 mmHg (NASA OCHMO-TB-004). Read it from the habitat sensor and enter it here{p.simulated ? "; the simulated habitat reads 3.4 today" : ""}.</p>
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); void saveCo2(); }}>
          <label className="field" style={{ margin: 0 }}><span>mmHg</span>
            <input type="number" inputMode="decimal" min={0} max={30} step={0.1} value={co2Text} onChange={(e) => setCo2Text(e.target.value)} style={{ width: 120 }} /></label>
          <button className="btn" type="submit">Save</button>
          {co2 !== undefined && <StatusBadge status={co2 > PULSE_RULES.co2LimitMmHg ? "red" : co2 > 2.5 ? "yellow" : "green"} word={co2 > PULSE_RULES.co2LimitMmHg ? "Above limit" : co2 > 2.5 ? "Near limit" : "Inside limit"} />}
        </form>
      </section>

      <section className="next" style={{ marginTop: 36 }}>
        <span className="label">Privacy by design</span>
        <p className="small" style={{ marginTop: 8 }}>
          The CMO sees each person's colour, warning signs and pattern type, never their mood score or notes. Mood stays with the crew member unless they choose to share it
          (NASA-STD-3001 Vol 1 Rev C [V1 6002], private medical communication). Crew Pulse never ranks or compares people.
        </p>
      </section>
      <Disclaimer />
    </>
  );
}

function Cell({ d, today }: { d?: CrewDay; today: boolean }) {
  if (!d) return <td className={`pc none${today ? " today" : ""}`}><span className="pc-word">{today ? "Not yet" : "—"}</span></td>;
  const s = d.overall;
  const flags: string[] = [];
  if (d.symptoms.includes("headache")) flags.push("H");
  if (feverFlag(d)) flags.push("F");
  if (cabinFlag(d) === "short sleep") flags.push("Z");
  if (d.patterns.includes("PT-FATIGUE")) flags.push("P");
  const label = `${WORD[s]}${flags.length ? `, ${flags.join(" ")}` : ""}`;
  return (
    <td className={`pc s-${s}${today ? " today" : ""}`} title={`${d.name}, Sol ${d.day}: ${label}`}>
      <span className="pc-glyph" aria-hidden="true">{s === "none" ? "" : STATUS_GLYPH[s as Status]}</span>
      <span className="pc-word">{WORD[s]}</span>
      {flags.length > 0 && <span className="pc-flags" aria-label={`flags ${flags.join(" ")}`}>{flags.map((f) => <span key={f} className="pf">{f}</span>)}</span>}
    </td>
  );
}

function Finding({ f, crew }: { f: PulseFinding; crew: { crew: string; name: string }[] }) {
  const [open, setOpen] = useState(f.status !== "green");
  const names = f.crews.map((c) => crew.find((x) => x.crew === c)?.name.split(" ")[0] ?? c);
  return (
    <article className={`pattern-card pulse-card s-${f.status}`}>
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <StatusBadge status={f.status} word="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{f.title}</h3>
          <p style={{ margin: "6px 0 0" }}>{f.text}</p>
          {names.length > 0 && <p className="small muted" style={{ margin: "6px 0 0" }}>Crew: {names.join(", ")} · Rule {f.id}</p>}
          {open && f.doNow.length > 0 && (
            <>
              <span className="label" style={{ display: "block", marginTop: 12 }}>CMO: do now</span>
              <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>{f.doNow.map((s) => <li key={s}>{s}</li>)}</ol>
              <p className="small muted" style={{ marginTop: 10 }}>Source: {f.source}</p>
            </>
          )}
          {f.doNow.length > 0 && <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "What to do and why"} <span aria-hidden="true">{G.chev}</span></button>}
        </div>
      </div>
    </article>
  );
}
