import { useState } from "react";
import { download, toFhirBundle, toJsonExport } from "../app/export";
import { isVaultStore, useApp } from "../app/store";
import { GUIDANCE_VERSION } from "../content/guidance";
import { HORIZONS_RANGE } from "../engine/horizons";
import { RULES } from "../engine/rules";
import type { MissionSetting } from "../engine/types";
import { CLINIC_DEFAULTS, fmtTz, LANGS, type Lang } from "../i18n";
import { PBKDF2_ITERATIONS, toB64 } from "../storage/crypto";
import type { ClinicSetting } from "../storage/events";
import { Disclaimer, G, TopBar, getThemeMode, setThemeMode, type ThemeMode } from "../ui/ui";

export function Settings() {
  const app = useApp();
  const { state } = app;
  const p = state.profile!;
  const [name, setName] = useState(p.name);
  const [role, setRole] = useState(p.role);
  const [mission, setMission] = useState<MissionSetting>(p.mission);
  const [launch, setLaunch] = useState(p.launchDate);
  const [date, setDate] = useState(state.settings.dateOverride ?? "");
  const [raw, setRaw] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode);
  // "Delay is delay" Earth mode (PRD v3 6.4). Stored as settings.clinic; the Reply Clock
  // reads it through linkFor() on Home and Body, so nothing else needs to know.
  const [clinic, setClinic] = useState<ClinicSetting>({ ...CLINIC_DEFAULTS, ...state.settings.clinic });
  const lang: Lang = state.settings.lang ?? "en";

  const flash = (s: string) => { setSaved(s); setTimeout(() => setSaved(""), 2500); };
  const setOverride = async (d: string) => { setDate(d); await app.setSettings({ dateOverride: d }); flash("Mission date updated"); };
  const saveClinic = async (patch: Partial<ClinicSetting>) => {
    const next: ClinicSetting = { ...clinic, ...patch };
    if (!Number.isFinite(next.travelMin) || next.travelMin < 0) next.travelMin = CLINIC_DEFAULTS.travelMin;
    if (!Number.isFinite(next.tzOffsetMin)) next.tzOffsetMin = CLINIC_DEFAULTS.tzOffsetMin;
    next.name = next.name.trim() || CLINIC_DEFAULTS.name;
    setClinic(next);
    await app.setSettings({ clinic: next });
    flash(next.on ? "Rural clinic mode on" : "Space mission mode");
  };
  const setLang = async (l: Lang) => { await app.setSettings({ lang: l }); flash(l === "te" ? "Daily check in Telugu (draft)" : "Daily check in English"); };
  const hourOpts = Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>);

  return (
    <>
      <TopBar title="Settings">{saved ? <span className="tag tag-ok" role="status"><span className="sw" />{saved}</span> : <span>Profile, mission clock, data and security</span>}</TopBar>
      <div className="settings">
        <section className="panel">
          <span className="label">Profile</span>
          <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Crew role</span><input value={role} onChange={(e) => setRole(e.target.value)} /></label>
          <label className="field"><span>Mission setting (changes the Earth delay and wording)</span>
            <select value={mission} onChange={(e) => setMission(e.target.value as MissionSetting)}>
              <option value="mars">Mars base</option><option value="moon">Lunar base</option><option value="iss">ISS</option>
            </select></label>
          <label className="field"><span>Launch date</span><input type="date" value={launch} onChange={(e) => setLaunch(e.target.value)} /></label>
          <div><button className="btn btn-primary" disabled={!name.trim()} onClick={async () => { await app.setProfile({ ...p, name: name.trim(), role, mission, launchDate: launch }); flash("Profile saved"); }}>Save profile</button></div>
        </section>

        <section className="panel">
          <span className="label">Mission clock</span>
          <p className="small muted">Use another date to replay the Earth delay or the 2028 Sun blackout. Horizons data covers {HORIZONS_RANGE.start} to {HORIZONS_RANGE.end}.</p>
          <label className="field"><span>Mission date</span><input type="date" value={date} min={HORIZONS_RANGE.start} max={HORIZONS_RANGE.end} onChange={(e) => void setOverride(e.target.value)} /></label>
          <div className="chips">
            <button className="chip" aria-pressed={!date} onClick={() => void setOverride("")}>Real today</button>
            <button className="chip" aria-pressed={date === "2026-11-14"} onClick={() => void setOverride("2026-11-14")}>Nov 14, 2026 (11.0 min)</button>
            <button className="chip" aria-pressed={date === "2028-03-20"} onClick={() => void setOverride("2028-03-20")}>Mar 20, 2028 (Sun blackout)</button>
            <button className="chip" aria-pressed={date === "2029-03-30"} onClick={() => void setOverride("2029-03-30")}>Mar 30, 2029 (closest, 5.4 min)</button>
          </div>
          <label className="field"><span>Daily reminder (local {p.mission === "mars" ? "Mars sol " : ""}time)</span>
            <select value={state.settings.reminderHour} onChange={(e) => void app.setSettings({ reminderHour: Number(e.target.value) })}>
              {[5, 6, 7, 8, 9].map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select></label>
        </section>

        <section className="panel" data-testid="earth-mode">
          <span className="label">Earth use: delay is delay</span>
          <p className="small muted">A concept, not clinical advice. The same Reply Clock that tells an astronaut whether Earth can answer in time tells a community health worker whether the nearest doctor can.</p>
          <div className="seg" aria-label="Rural clinic mode">
            <button aria-pressed={!clinic.on} onClick={() => void saveClinic({ on: false })}>Space mission</button>
            <button aria-pressed={clinic.on} data-testid="clinic-on" onClick={() => void saveClinic({ on: true })}>Rural clinic mode</button>
          </div>
          {clinic.on && (
            <>
              <p className="small">With clinic mode on, the Reply Clock uses your travel time and the clinic&apos;s opening hours instead of light time and the flight surgeon&apos;s shift; JPL Horizons is not used.</p>
              <label className="field"><span>Clinic or doctor (how the Reply Clock names the far end)</span>
                <input value={clinic.name} onChange={(e) => setClinic({ ...clinic, name: e.target.value })} onBlur={() => void saveClinic({})} /></label>
              <label className="field"><span>One-way travel time to the nearest doctor (minutes)</span>
                <input type="number" inputMode="numeric" min={0} step={5} value={Number.isFinite(clinic.travelMin) ? clinic.travelMin : ""}
                  onChange={(e) => setClinic({ ...clinic, travelMin: e.target.valueAsNumber })} onBlur={() => void saveClinic({})} /></label>
              <div className="row" style={{ alignItems: "stretch" }}>
                <label className="field" style={{ flex: "1 1 120px" }}><span>Clinic opens</span>
                  <select value={clinic.openHour} onChange={(e) => void saveClinic({ openHour: Number(e.target.value) })}>{hourOpts}</select></label>
                <label className="field" style={{ flex: "1 1 120px" }}><span>Clinic closes</span>
                  <select value={clinic.closeHour} onChange={(e) => void saveClinic({ closeHour: Number(e.target.value) })}>{hourOpts}</select></label>
              </div>
              <label className="field"><span>Clinic time zone, minutes from UTC (now {fmtTz(Number.isFinite(clinic.tzOffsetMin) ? clinic.tzOffsetMin : CLINIC_DEFAULTS.tzOffsetMin)})</span>
                <input type="number" inputMode="numeric" step={15} min={-720} max={840} value={Number.isFinite(clinic.tzOffsetMin) ? clinic.tzOffsetMin : ""}
                  onChange={(e) => setClinic({ ...clinic, tzOffsetMin: e.target.valueAsNumber })} onBlur={() => void saveClinic({})} /></label>
              <p className="small muted">Defaults: {CLINIC_DEFAULTS.name}, {CLINIC_DEFAULTS.travelMin} min each way, open {String(CLINIC_DEFAULTS.openHour).padStart(2, "0")}:00-{String(CLINIC_DEFAULTS.closeHour).padStart(2, "0")}:00, {fmtTz(CLINIC_DEFAULTS.tzOffsetMin)} (IST). All of these are assumptions you set, and the Reply Clock labels them so.</p>
            </>
          )}
          <span className="small" style={{ color: "var(--ink-2)" }}>Language for the daily check</span>
          <div className="seg" aria-label="Language for the daily check">
            {LANGS.map((l) => <button key={l.id} aria-pressed={lang === l.id} data-testid={`lang-${l.id}`} onClick={() => void setLang(l.id)}>{l.label}</button>)}
          </div>
          <p className="small muted">Only the daily check changes language. The Telugu text is a machine-assisted draft awaiting native review (docs/i18n); rules, thresholds and colours do not change.</p>
        </section>

        <section className="panel">
          <span className="label">Appearance</span>
          <p className="small muted">Follows this device's light or dark setting unless you pick one. Saved on this device only.</p>
          <div className="seg" aria-label="Appearance">
            {(["system", "light", "dark"] as ThemeMode[]).map((m) => (
              <button key={m} aria-pressed={theme === m} onClick={() => { setThemeMode(m); setTheme(m); }}>{m === "system" ? "System" : m === "light" ? "Light" : "Dark"}</button>
            ))}
          </div>
        </section>

        <section className="panel">
          <span className="label">Your data</span>
          <p className="small muted">Everything stays on this device, encrypted. Export is the only way it leaves, apart from red alerts and the daily digest to Earth.</p>
          <div className="row">
            <button className="btn" onClick={async () => download(`asclepius-${p.crewId}.json`, toJsonExport(await app.events(), p))}>Export JSON</button>
            <button className="btn" onClick={async () => download(`asclepius-${p.crewId}.fhir.json`, toFhirBundle(await app.events(), p), "application/fhir+json")}>Export FHIR R4</button>
          </div>
          {isVaultStore(app.store) && (
            <>
              <div><button className="btn btn-ghost" aria-expanded={!!raw} onClick={async () => {
                if (raw) return setRaw(null);
                const s = isVaultStore(app.store) ? (await app.store.rawSample(1))[0] : undefined;
                setRaw(s ? `iv: ${toB64(s.iv)}\nct: ${toB64(s.ct).slice(0, 240)}…` : "empty");
              }}>{raw ? "Hide the record on disk" : "Show how a record looks on disk"}</button></div>
              {raw && <pre className="json" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{raw}</pre>}
            </>
          )}
          <p className="small muted">{state.eventCount} events in the append-only log · {app.store?.persistent ? `AES-GCM 256, key from passphrase (PBKDF2-SHA-256, ${PBKDF2_ITERATIONS.toLocaleString()} iterations)` : "Video mode: nothing is stored"}</p>
        </section>

        <section className="panel">
          <span className="label">Security</span>
          <p className="small muted" data-testid="earth-crypto">
            {app.security
              ? <>Earth messages: <b>Hermes OpenPGP</b> (desktop app). Crew key <span className="mono">{app.security.crewFingerprint}</span>. Flight surgeon key: simulated ground station.</>
              : <>Earth messages: <b>WebCrypto</b> (ECDSA P-256 signature, ECDH P-256 + AES-GCM 256). The desktop app uses the team&apos;s Hermes OpenPGP library instead.</>}
          </p>
          <div className="row">
            <button className="btn" onClick={() => app.lock()}><span aria-hidden="true">{G.lock}</span>Lock now</button>
            {!confirm && <button className="btn btn-ghost" style={{ color: "var(--red-ink)" }} onClick={() => setConfirm(true)}>Erase all data on this device…</button>}
          </div>
          {confirm && (
            <div className="banner banner-cmo" style={{ margin: 0 }} role="alert">
              <span className="bi" aria-hidden="true">{G.alert}</span>
              <div className="stack">
                <p>This deletes the vault and every check. It cannot be undone. Export first if you need a copy.</p>
                <div className="row">
                  <button className="btn btn-danger" onClick={() => void app.erase()}>Erase everything</button>
                  <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="panel wide">
          <span className="label">About</span>
          <p>ASCLEPIUS is an offline daily health self-check for astronauts, built for the NASA Space Apps Challenge 2026
            (<i>Create Health Monitoring Software for Astronauts on Space Missions</i>). Team ASCLEPIUS, Warangal, India.</p>
          <p className="small muted">Rules v{RULES.version} · guidance v{GUIDANCE_VERSION} · every colour comes from a readable rule in <span className="mono">rules.json</span>, never from AI.
            Data: NASA JPL Horizons, NASA OSDR OSD-569 / OSD-575 (SpaceX Inspiration4), NASA HRP hazards. Crew data shown for Asha Rao is simulated.
            Open source: React, Vite, Dexie, Recharts, Workbox (MIT/Apache-2.0).</p>
          <Disclaimer />
        </section>
      </div>
    </>
  );
}
