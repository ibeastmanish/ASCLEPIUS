import { dayLabel, fmtDate, utcHM } from "../app/clock";
import { useApp } from "../app/store";
import { guidance } from "../content/guidance";
import { blackoutLastDay, earthFor, formatDelay, isBlackout, series, sunAngleDeg } from "../engine/horizons";
import { formatMarsTime, nextLocalTime } from "../engine/mars";
import { RULES, describe, fmt, worst } from "../engine/rules";
import type { CheckResult, DayRecord, Indicator, IndicatorResult, Status } from "../engine/types";
import { CORE_INDICATORS } from "../engine/types";
import { computeReplyClock, formatDuration, houstonTime, linkFor, replyClockForCheck, solsUntilAlignedMorning, surgeonOnShift } from "../engine/replyclock";
import { ReplyClockCard } from "../ui/replyclock";
import { badges, checksOn, dueIndicators, historyBefore, latestValues, streak } from "../storage/projection";
import { Disclaimer, G, OVERALL_WORD, STATUS_GLYPH, StatusBadge, TopBar, fmtMinutes } from "../ui/ui";

export function EarthBanner() {
  const { state, today } = useApp();
  const mission = state.profile?.mission ?? "mars";
  const e = earthFor(today, mission);
  if (!e.blackout) return null;
  return (
    <div className="banner banner-blackout" role="status">
      <span className="bi" aria-hidden="true">{G.sun}</span>
      <span><b>The Sun is between Mars and Earth. Earth can't hear you right now.</b><br />
        Messages to Earth are held until {fmtDate(e.blackoutEnd!)}. Red alerts go to the crew medical officer only. (Sun–Earth–Mars angle {sunAngleDeg(today).toFixed(2)}°)</span>
    </div>
  );
}

const LEVEL_WORD = { "earth-guided": "Earth guides", "earth-consulted": "act, Earth confirms", "crew-decides": "crew decides" } as const;
const MISSION_NAME = { mars: "Mars base", moon: "Lunar base", iss: "ISS" } as const;

export function Home() {
  const { state, today, day, now } = useApp();
  const p = state.profile!;
  const todayChecks = checksOn(state, today);
  const latest = todayChecks.at(-1);
  const e = earthFor(today, p.mission);
  const st = streak(state, today);
  const learning = CORE_INDICATORS.filter((i) => !state.baselines[i]?.ready);
  const reminderHour = state.settings.reminderHour;
  const next = p.mission === "mars" ? nextLocalTime(now.getTime(), reminderHour, p.baseLonE) : null;
  const recheckDue = latest?.escalation === "recheck" && p.mission === "mars" ? nextLocalTime(Date.parse(latest.ts), 19, p.baseLonE) : null;
  const alertsToday = state.cmoAlerts.filter((a) => a.ts.slice(0, 10) === today || todayChecks.some((c) => c.checkId === a.checkId));
  const greeting = `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}, ${p.name.split(" ")[0]}`;

  const pattern = latest?.patterns.find((x) => x.status !== "green");
  const pg = pattern ? guidance(pattern.guidanceId) : undefined;
  const overall: Status | "none" = latest?.overall ?? "none";
  const link = linkFor(today, p.mission, state.settings.clinic);
  const latestClock = latest ? replyClockForCheck(latest, p.mission, p.baseLonE, linkFor(latest.date, p.mission, state.settings.clinic)) : null;
  // Today's Reply Clock for a routine yellow and for a red, from right now.
  const a = RULES.replyClock.actWithinMin;
  const yellowNow = computeReplyClock({ nowMs: now.getTime(), link, priority: "routine", actWithinMin: a["tell-cmo"], actBasis: "", mission: p.mission, baseLonE: p.baseLonE });
  const redNow = computeReplyClock({ nowMs: now.getTime(), link, priority: "red", actWithinMin: a.red, actBasis: "", mission: p.mission, baseLonE: p.baseLonE });
  const morning = p.mission === "mars" ? nextLocalTime(now.getTime(), reminderHour, p.baseLonE) : null;
  const aligned = morning !== null ? solsUntilAlignedMorning(morning) : null;

  return (
    <>
      <TopBar title={greeting}>
        <span>{p.role} · {MISSION_NAME[p.mission]} · {dayLabel(day)} · {fmtDate(today)}</span>
      </TopBar>
      <EarthBanner />
      {alertsToday.length > 0 && (
        <div className="banner banner-cmo" role="alert"><span className="bi" aria-hidden="true">{G.cross}</span>
          <span><b>Crew medical officer alerted</b> at {utcHM(alertsToday.at(-1)!.ts)}. {alertsToday.at(-1)!.reason}</span>
        </div>
      )}
      {latest?.escalation === "tell-cmo" && (
        <div className="banner banner-yellow"><span className="bi" aria-hidden="true">{G.alert}</span><span><b>Tell the crew medical officer today.</b> {latest.escalationWhy.slice(1).join(" ")}</span></div>
      )}

      <div className="home-top">
        <section className="answer" aria-label="Today's answer">
          <div className={`answer-sq s-${overall}`} aria-hidden="true">{latest ? STATUS_GLYPH[overall] : G.arrow}</div>
          <div>
            {latest ? (
              <>
                <h2>{OVERALL_WORD[overall]}.{pg && <><br />{pg.title}.</>}</h2>
                <p>
                  {pg ? pg.what : overall === "green" ? "Everything is inside the usual adult range and inside your own normal." : latest.escalationWhy[0]}
                  {recheckDue && <> Recheck at 19:00 local, in {fmtMinutes((recheckDue - now.getTime()) / 60000)}.</>}
                </p>
                <div className="row">
                  <a className="btn btn-primary btn-lg" href="#/check">{overall === "green" ? "Check again" : "Recheck now"}</a>
                  <a className="btn btn-lg" href="#/body">See body map</a>
                </div>
                <p className="small muted" style={{ marginTop: 12 }}>{todayChecks.length > 1 ? `${todayChecks.length} checks today` : "Checked today"} · <StatusBadge status={overall} /></p>
              </>
            ) : (
              <>
                <h2>Time for your<br />daily check.</h2>
                <p>About one minute. Six indicators, pre-filled from yesterday.</p>
                <div className="row"><a className="btn btn-primary btn-lg" href="#/check">Start check</a></div>
              </>
            )}
          </div>
        </section>

        <section className="earth-field" aria-label="Earth link">
          <span className="label">Earth link · NASA JPL Horizons</span>
          {p.mission === "mars" ? (
            <>
              <span className="big-num">{e.oneWayMin.toFixed(1)}<small>min one way</small></span>
              <div className="lightline" aria-hidden="true"><div className="track" /><span className="end mars" /><span className="photon" /><span className="end earth" /></div>
              <div className="lightline-labels" aria-hidden="true"><span>Mars</span><span>Earth</span></div>
              <p>{e.blackout ? "Held: the Sun blocks the radio link. Your crew decides; Earth reviews afterwards." : <>
                Right now Earth can answer a red in <b>{formatDuration(redNow.earliestReplyMin)}</b> ({LEVEL_WORD[redNow.level]}) and a yellow in <b>{formatDuration(yellowNow.earliestReplyMin)}</b> ({LEVEL_WORD[yellowNow.level]}).
              </>}</p>
              <p className="small">Houston {houstonTime(now.getTime())} · flight surgeon {surgeonOnShift(now.getTime()) ? "on shift" : "off shift"}.
                {aligned !== null && morning !== null && (aligned === 0
                  ? " Your morning check falls in the surgeon's shift."
                  : ` A Mars sol is 39.6 min longer than a day, so your ${String(reminderHour).padStart(2, "0")}:00 check drifts against Houston; it lines up with the surgeon's shift again in ${aligned} sol${aligned === 1 ? "" : "s"}.`)}
              </p>
              <NextBlackout today={today} />
            </>
          ) : (
            <>
              <span className="big-num">{formatDelay(e.oneWayMin)}</span>
              <p>One-way delay to Earth.</p>
            </>
          )}
        </section>
      </div>

      {latestClock && <ReplyClockCard clock={latestClock} />}

      <Specimens check={latest} />

      <div className="stats">
        <section className="stat">
          <span className="label">Streak</span>
          <span className="big-num">{st}</span>
          <span className="small">days in a row with a check</span>
        </section>
        <section className="stat">
          <span className="label">Next reminder</span>
          <span className="big-num">{String(reminderHour).padStart(2, "0")}:00</span>
          <span className="small">{next ? <>local Mars time, in {fmtMinutes((next - now.getTime()) / 60000)} · now {formatMarsTime(now.getTime(), p.baseLonE)} LMST</> : "local time"}</span>
        </section>
        <section className="stat">
          <span className="label">Your normal</span>
          {learning.length === 0 ? (
            <><span className="big-num">Learned</span><span className="small">Personal bands on for all six indicators.</span></>
          ) : (
            <LearningProgress missing={learning} />
          )}
        </section>
      </div>

      <h2 className="section-title">Badges</h2>
      <div className="badges">
        {badges(state, today).map((b) => (
          <div key={b.id} className={`badge${b.earned ? " earned" : ""}`} title={b.detail}>
            <span className="mark" aria-hidden="true">{b.earned ? G.check : G.dash}</span>
            <span><b>{b.name}</b><br />{b.detail}{b.earned && <span className="sr-only"> (earned)</span>}</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>Badges are personal. ASCLEPIUS never compares crew members.</p>
      <Disclaimer />
    </>
  );
}

// ------------------------------------------------------------------ the six readings as manual specimens
type Spec = { key: string; label: string; inds: Indicator[] };
const SPECS: Spec[] = [
  { key: "bp", label: "Blood pressure", inds: ["bp_sys", "bp_dia"] },
  { key: "hr", label: "Heart rate", inds: ["hr"] },
  { key: "glucose", label: "Blood sugar", inds: ["glucose"] },
  { key: "temp", label: "Temperature", inds: ["temp"] },
  { key: "sleep", label: "Sleep", inds: ["sleep"] },
  { key: "mood", label: "Mood", inds: ["mood"] },
];

function NextBlackout({ today }: { today: string }) {
  if (isBlackout(today)) return null;
  const start = series().find((d) => d.date > today && isBlackout(d.date))?.date;
  if (!start) return null;
  const end = blackoutLastDay(start);
  return (
    <dl className="earth-facts">
      <div><dt>Next Sun blackout</dt><dd>{fmtDate(start)}{end ? ` – ${fmtDate(end)}` : ""}</dd></div>
      <div><dt>Sun–Earth–Mars angle</dt><dd>{sunAngleDeg(today).toFixed(1)}°</dd></div>
    </dl>
  );
}

/** Ring gauge: how many of the last 7 recorded days this reading was green (inside the usual range and your normal). */
function WeekRing({ inds, days }: { inds: Indicator[]; days: DayRecord[] }) {
  const seen = days.filter((d) => inds.every((i) => d.statuses[i] !== undefined));
  const green = seen.filter((d) => inds.every((i) => d.statuses[i] === "green")).length;
  const n = seen.length;
  const C = 2 * Math.PI * 22;
  const frac = n ? green / n : 0;
  const tone = !n ? "none" : frac >= 6 / 7 ? "green" : frac >= 3 / 7 ? "yellow" : "red";
  return (
    <div className={`week-ring wr-${tone}`} role="img" aria-label={n ? `${green} of the last ${n} days in your normal` : "No recent days"}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="22" className="wr-track" />
        <circle cx="26" cy="26" r="22" className="wr-arc" strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 26 26)" />
      </svg>
      <span aria-hidden="true">{n ? `${green}/${n}` : "–"}</span>
    </div>
  );
}

function Specimens({ check }: { check: CheckResult | undefined }) {
  const { state, today } = useApp();
  const last = latestValues(state);
  const resting = dueIndicators(state, today).resting;
  const week = [...historyBefore(state, today)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  return (
    <section className="specimens" aria-label="Today's readings">
      {SPECS.map((s) => {
        const rs = s.inds.map((i) => check?.results.find((r) => r.indicator === i)).filter(Boolean) as IndicatorResult[];
        const status: Status | "none" = rs.length ? rs.reduce<Status>((a, r) => worst(a, r.status), "invalid") : "none";
        const lead = rs[0];
        const i0 = s.inds[0];
        const r0 = RULES.indicators[i0];
        const v0 = lead?.value ?? last[i0];
        const dia = s.key === "bp" ? (rs[1]?.value ?? last.bp_dia) : undefined;
        const unit = s.key === "bp" ? `/${dia !== undefined ? fmt("bp_dia", dia) : "–"} mmHg` : s.key === "mood" ? "of 5" : s.key === "sleep" ? "hours" : r0.unit;
        const usual = describe(r0.clinical.green).replace(/ or more$/, "+");
        return (
          <div key={s.key} className="spec">
            <WeekRing inds={s.inds} days={week} />
            <span className="label">{s.label}</span>
            <div className="spec-num">{v0 !== undefined ? fmt(i0, v0) : "–"}</div>
            <div className="spec-unit">{unit}</div>
            <div className={`spec-bar s-${status} wipe`} aria-hidden="true" />
            <div className="spec-foot">
              <StatusBadge status={status} word={status === "none" ? (s.inds.every((i) => resting.includes(i)) ? "Steady · not due today" : "Not checked today") : undefined} />
              <span>{lead?.band ? <>Yours <b>{fmt(i0, lead.band.low)}–{fmt(i0, lead.band.high)}</b> · usual {usual}</> : <>Usual {usual}</>}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function LearningProgress({ missing }: { missing: Indicator[] }) {
  const { state } = useApp();
  const need = RULES.baseline.learningChecks;
  const n = Math.min(...missing.map((i) => state.baselines[i]?.n ?? 0));
  return (
    <>
      <span className="big-num">{Math.min(n, need)}/{need}</span>
      <div className="progress" aria-hidden="true"><span style={{ width: `${(Math.min(n, need) / need) * 100}%` }} /></div>
      <span className="small">Learning your normal. Until then only the usual adult ranges are used.</span>
    </>
  );
}
