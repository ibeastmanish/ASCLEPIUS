import { useState } from "react";
import { download, toFhirBundle, toJsonExport } from "../app/export";
import { isVaultStore, useApp } from "../app/store";
import { GUIDANCE_VERSION } from "../content/guidance";
import { HORIZONS_RANGE } from "../engine/horizons";
import { RULES } from "../engine/rules";
import type { MissionSetting } from "../engine/types";
import { PBKDF2_ITERATIONS, toB64 } from "../storage/crypto";
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

  const flash = (s: string) => { setSaved(s); setTimeout(() => setSaved(""), 2500); };
  const setOverride = async (d: string) => { setDate(d); await app.setSettings({ dateOverride: d }); flash("Mission date updated"); };

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
