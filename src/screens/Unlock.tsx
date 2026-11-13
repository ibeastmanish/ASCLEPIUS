import { useState } from "react";
import { addDays } from "../engine/evaluate";
import { localDate, newId } from "../app/clock";
import { useApp } from "../app/store";
import type { MissionSetting } from "../engine/types";

export function Unlock() {
  const app = useApp();
  return (
    <div className="unlock">
      <div className="unlock-band" />
      <div className="unlock-grid">
        <section className="cover">
          <h1>ASCLEPIUS<span className="sq" aria-hidden="true" /></h1>
          <p className="tagline">Health for the Artemis generation.</p>
          <p className="subline">The one-minute daily health self-check for astronauts, built for missions where Earth is minutes away.</p>
          <div className="facts">
            <p className="fact"><b>Your normal, not everyone's</b>Every reading is checked against the usual adult range and your own learned baseline. The worse result wins.</p>
            <p className="fact"><b>Works with no internet</b>The checks, the rules and your data all live on this device. Earth is minutes away by radio.</p>
            <p className="fact"><b>Every colour explained</b>Each green, yellow or red names its rule, value, band and source. No AI decides.</p>
          </div>
        </section>
        <section className="unlock-card">
          <h2>{app.phase === "setup" ? "Create your Health Vault" : "Unlock your Health Vault"}</h2>
          {app.phase === "setup" ? <Setup /> : <Login />}
        </section>
      </div>
      <footer className="unlock-foot">
        <span>Your health data never leaves this device unless you export it or a red alert or daily digest is sent to Earth.</span>
        <span>Decision support, not a medical device.</span>
      </footer>
    </div>
  );
}

function Busy({ text }: { text: string }) {
  return <span className="row" style={{ gap: 10 }}><span className="spinner" />{text}</span>;
}

function Login() {
  const app = useApp();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      setErr("");
      if (!(await app.unlock(pass))) setErr("That passphrase didn't open the vault. Try again.");
    }}>
      <label className="field">
        <span className="label">Passphrase</span>
        <input type="password" autoFocus autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn btn-primary btn-lg" disabled={!pass || !!app.busy}>{app.busy ? <Busy text={app.busy} /> : "Unlock Health Vault"}</button>
      {!confirmErase ? (
        <button type="button" className="btn btn-ghost small" onClick={() => setConfirmErase(true)}>Forgot passphrase?</button>
      ) : (
        <div className="stack small">
          <p>There is no recovery: the data is encrypted with your passphrase. You can erase this device's vault and start again.</p>
          <button type="button" className="btn btn-danger" onClick={() => app.erase()}>Erase vault on this device</button>
        </div>
      )}
    </form>
  );
}

function Setup() {
  const app = useApp();
  // Simulated persona is on by default (judges); ?seed=none starts empty, ?seed=asha forces it.
  const [demo, setDemo] = useState(new URLSearchParams(location.search).get("seed") !== "none");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Mission specialist");
  const [mission, setMission] = useState<MissionSetting>("mars");
  const [launch, setLaunch] = useState(addDays(localDate(), 30));
  const tooShort = pass.length > 0 && pass.length < 8;
  const mismatch = pass2.length > 0 && pass !== pass2;
  const ok = pass.length >= 8 && pass === pass2 && (demo || name.trim().length > 0);

  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      if (!ok) return;
      await app.setup(pass, demo ? "asha" : {
        crewId: newId("crew"), name: name.trim(), role, mission, launchDate: launch, baseLonE: 137.4,
      });
    }}>
      <p className="muted">Set a passphrase. It encrypts everything on this device and cannot be recovered.</p>
      <label className="field">
        <span className="label">Passphrase (8+ characters)</span>
        <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      {tooShort && <p className="err">Use at least 8 characters.</p>}
      <label className="field">
        <span className="label">Repeat passphrase</span>
        <input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
      </label>
      {mismatch && <p className="err">The two passphrases don't match.</p>}

      <label className="check-row">
        <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
        <span><b>Load the simulated crew member</b><br />Commander Asha Rao (fictional), Mars base, Day 212: 14 pre-flight and 211 flight checks.</span>
      </label>

      {!demo && (
        <>
          <label className="field"><span className="label">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="field"><span className="label">Crew role</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} /></label>
          <label className="field"><span className="label">Mission setting</span>
            <select value={mission} onChange={(e) => setMission(e.target.value as MissionSetting)}>
              <option value="mars">Mars base</option>
              <option value="moon">Lunar base</option>
              <option value="iss">ISS (low Earth orbit)</option>
            </select></label>
          <label className="field"><span className="label">Launch date (checks before it teach "your normal")</span>
            <input type="date" value={launch} onChange={(e) => setLaunch(e.target.value)} /></label>
        </>
      )}
      <button className="btn btn-primary btn-lg" disabled={!ok || !!app.busy}>{app.busy ? <Busy text={app.busy} /> : "Create Health Vault"}</button>
    </form>
  );
}
