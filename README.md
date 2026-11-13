# ASCLEPIUS
### *Health for the Artemis generation.*

**Live demo:** https://ibeastmanish.github.io/hygiea/ · [![CI](https://github.com/ibeastmanish/hygiea/actions/workflows/ci.yml/badge.svg)](https://github.com/ibeastmanish/hygiea/actions/workflows/ci.yml)

ASCLEPIUS is an offline tablet app that turns a quick daily check of six health indicators into a clear answer (green, yellow or red). It explains the answer in plain words on a clickable body map, tells the astronaut what to do, and alerts the crew doctor and Earth only when it's serious.

> **Normal for everyone is not normal for you.** A resting heart rate of 74 is fine for most people. For an astronaut whose own normal is 52-62, it is a warning sign. ASCLEPIUS checks every reading against the usual adult range **and** against the astronaut's own learned baseline. The worse result wins.

Built for the NASA Space Apps Challenge 2026: *Create Health Monitoring Software for Astronauts on Space Missions*. Team ASCLEPIUS, Warangal, India.

**Decision support, not a medical device.** ASCLEPIUS does not diagnose. Every colour comes from a readable rule, never from AI.

---

## 60-second quick start
1. Open the live demo (it works on a phone). Choose any passphrase of 8 or more characters. Keep **Load the simulated crew member** ticked. You are now Commander Asha Rao (fictional) on Day 212 at a Mars base.
2. **Start check.** The tiles are pre-filled from yesterday. Set heart rate **74**, sleep **5.2**, mood **3**, then **Finish check**.
3. The **body map** glows yellow at the brain and heart, with one *Fatigue pattern* card. Tap **Heart**, then scroll to **Why this colour?**: 74 bpm is inside 60-100 for adults but above *her* normal of 52-62.
4. Do another check with blood sugar **48**. You get the full-screen **Act now** alert, the crew medical officer is alerted, and a signed, encrypted summary goes to the **Earth outbox**, arriving 11 min later on Nov 14, 2026. In the outbox, try **Ground view, then Tamper test**.
5. **Settings, then Mar 20, 2028** replays the Sun blackout. Earth messages are held until Apr 4, 2028.

Scripted, repeatable demo views for the video (simulated data, nothing stored): `?video=check`, `?video=bodymap`, `?video=proof`, `?video=outbox`.

## How it works
```
 UI (React) ──postMessage──► ENGINE WORKER (pure TypeScript, rules.json v1.0.0)
   ▲                           validity → red flags → clinical → personal → trend
   │ results                   → patterns → overall (worst wins) → escalation
   │                                    │
   │                         EVENT LOG (IndexedDB via Dexie, append-only)
   │                         each event AES-GCM 256 encrypted; key from passphrase
   └──── projections ◄──────────────────┤  (PBKDF2-SHA-256, 600,000 iterations), memory only
         today, trends, baselines,      ▼
         streak, badges           OUTBOX: red alert > daily digest
                                  CBOR + gzip, ECDSA P-256 signed, ECDH P-256 + AES-GCM encrypted,
                                  ETA from JPL Horizons, held during the Sun blackout
          No server. No internet needed after the first load. Everything runs on the tablet.
```

| Layer | What it does | Where |
|---|---|---|
| Validity | Impossible values are never coloured: "Please re-measure" | `src/engine/evaluate.ts` |
| Red flags | Crisis values and warning signs (chest pain, fainting…) are red at once, and nothing can skip them | `rules.json` |
| Clinical | Usual adult ranges (AHA/ACC, ADA, AASM/SRS; marked `[VERIFY]`) | `rules.json` |
| Personal | median ± 2.5 × scaled MAD of your own checks, with a minimum half-width; learned from 7+ checks; drifts slowly (EWMA α 0.05) from green checks only | `src/engine/baseline.ts` |
| Trend | 3 short nights, 3 low-mood days, 3 days of raised HR, < 4 h sleep two nights running | `rules.json` |
| Patterns | One card instead of several alerts: `PT-FATIGUE`, `PT-FEVER` | `src/engine/evaluate.ts` |
| Escalation | none → recheck tonight → tell the CMO → alert the CMO + Earth | `src/engine/escalate.ts` |

Every result carries its **why**: rule ID, layer, value, band, source and rules version.

## NASA data
| Source | Used for | Files |
|---|---|---|
| **NASA JPL Horizons API** (Mars 499 from Earth 500@399, quantities 20 and 23, daily Nov 2026 to Dec 2029) | Earth delay for every date (11.0 min on Nov 14, 2026; 5.4 to 20.1 min), Sun blackout from Mar 8 to Apr 3, 2028 | `data/raw/horizons_earth_mars.json` → `src/data/horizons_delay.json` |
| **NASA OSDR OSD-569** (SpaceX Inspiration4 complete blood count) | Crew Reference: personal vs. population ranges | `data/raw/LSDS-7_…CBC…csv` |
| **NASA OSDR OSD-575** (Inspiration4 metabolic panel) | Glucose comparison | `data/raw/LSDS-8_…CMP…csv` |
| **NASA Human Research Program hazards** | "Why it matters in space" on every card | `src/content/guidance.json` |

**Finding:** on the day after landing, all 4 Inspiration4 crew had lymphocyte counts inside the lab's normal range. All 4 had moved more than 20% from their own pre-flight level (−26.8%, −27.3%, −33.9%, +20.7%). Caveat: 4 civilians on a 3-day flight. This illustrates the idea; it is not clinical evidence.

Provenance (URL, fetch time, size, SHA-256): [`data/manifest.json`](data/manifest.json). To reproduce:
```bash
npm run data          # regenerates src/data/*.json from data/raw (CI checks there is no diff)
npm run data:fetch    # re-downloads from NASA (optional)
```

## Simulated vs. real data
- **Simulated:** Commander Asha Rao and all her readings. She is generated through the real engine by `src/seed/asha.ts` and labelled *Simulated crew data* on every screen.
- **Real:** JPL Horizons delays and blackout; Inspiration4 blood data (Crew Reference screen, labelled with the study IDs).

## Optional: camera perfusion check (experimental)
The challenge brief names "camera images" as a valid health-indicator input. Alongside the six required
readings, ASCLEPIUS offers one optional seventh check: capillary refill time (CRT), a standard bedside
perfusion test. The astronaut presses a fingertip over the camera lens for five seconds, releases it, and
`src/engine/crt.ts` times how long the frame brightness takes to recover, using plain signal processing
(no AI, no ML model - a release-jump detector, a trough/plateau read, and a 90%-recovery crossing, exactly
as transparent as every other rule in `rules.json`). A manual stopwatch (`src/ui/CrtCapture.tsx`) is always
offered alongside it, so the check works with no camera, no permission, or no interest in using one. It
never appears in the required six-reading flow, the streak, or the badges; it is purely additive. **[VERIFY]**
Capillary refill thresholds here are project-defined and this self-test is not clinically validated -
confirm both with a flight surgeon before relying on it.

## Run locally
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 91 unit + property tests (Vitest + fast-check)
npm run build        # PWA in dist/ (about 270 KB gzipped)
```

## Desktop app (Tauri + Hermes)
The same app as an installed program, with no browser and no service worker. The UI, engine and vault are the same code. The one difference is that Earth messages are signed and encrypted with **Hermes** (`aura`, the team's earlier open-source OpenPGP library built on Sequoia) instead of WebCrypto.

| | Web build | Desktop build |
|---|---|---|
| Runs in | Any browser; installable PWA | macOS app (`.app` / `.dmg`); Windows and Linux build the same way |
| Earth message signature | ECDSA P-256 (WebCrypto) | OpenPGP Ed25519, Hermes `sign_message` |
| Earth message encryption | ECDH P-256 + AES-GCM 256 (WebCrypto) | OpenPGP X25519, Hermes `encrypt_message` |
| Message keys stored | Inside the encrypted vault (IndexedDB) | Hermes key vault files (Argon2 + XChaCha20-Poly1305), unlocked with the same passphrase |

The Rust side ([`src-tauri/src/lib.rs`](src-tauri/src/lib.rs)) exposes six commands built on Hermes functions: `hermes_unlock` (`create_identity`, `save_identity_to_vault`, `load_identity_from_vault`), `hermes_lock`, `hermes_status`, `hermes_seal` (`sign_message`, then `encrypt_message`), `hermes_open` (`decrypt_message`, then `verify_message`) and `hermes_erase`. The Outbox **Ground view** and **Tamper test** work the same way in both builds.

```bash
# Needs Rust (rustup) and the Hermes repo checked out next to this one:
git clone <hermes repo> ../hermes
npm run desktop:test       # Rust tests: round trip, one-bit tamper, forged signer, wrong passphrase, keys persist
npm run desktop:selftest   # builds the app, runs the full flow inside the real desktop window, prints a JSON report
npm run desktop:dev        # run the desktop app against the dev server
npm run desktop:build      # ASCLEPIUS.app + .dmg in src-tauri/target/release/bundle/
```

## Tests
- Every rule at, just below and just above each threshold, driven from `rules.json` (schema-validated with Ajv).
- Property tests (fast-check, thousands of random checks): invalid input is never coloured; overall is never greener than any result; a red-flag value is always red, whatever the context chips; any symptom makes the check red; escalation always matches the colour.
- Worked example (PRD 7.5): HR band 52-62, today's 74 is yellow with `HR-P1`. Journey J3 is reproduced from the seeded persona.
- Vault round trip; a wrong passphrase can't read; the data on disk is ciphertext. A signed, encrypted Earth message verifies, and a one-bit tamper or a wrong signing key fails.
- Earth link: 11.0 min on 2026-11-14; held during the blackout, then released on 2028-04-04. Daily digest under 2 KB.
- Performance: a full check evaluates in under 100 ms (about 1 ms measured).

## Privacy and security
- All data stays on the device in IndexedDB. Each event is encrypted with AES-GCM 256. The key comes from your passphrase and is kept only in memory. ASCLEPIUS asks the browser for persistent storage.
- Nothing leaves the device unless you export it (JSON or HL7 FHIR R4 with LOINC codes) or a red alert or daily digest is queued for Earth.
- Earth messages are signed (ECDSA P-256, crew key) and encrypted to the flight surgeon's key (ECDH P-256 + AES-GCM 256) with WebCrypto. In this demo the flight-surgeon key is a **simulated ground station**, so the app can show decryption and tamper detection. The desktop build does the same with the team's Hermes OpenPGP library (see *Desktop app*).

## Licences and credits
ASCLEPIUS is MIT-licensed (see `LICENSE`). Desktop build: Tauri (MIT OR Apache-2.0), Hermes `aura` (MIT OR Apache-2.0), Sequoia OpenPGP (LGPL-2.0-or-later, linked as a library). Dependencies: React (MIT), Vite (MIT), vite-plugin-pwa / Workbox (MIT), Dexie (Apache-2.0), Recharts (MIT), Vitest (MIT), fast-check (MIT), Ajv (MIT), fake-indexeddb (Apache-2.0), oxlint (MIT), TypeScript (Apache-2.0).
NASA data is public: JPL Horizons, NASA OSDR (OSD-569, OSD-575), NASA HRP.



## Open items before submission
- `[VERIFY]` every clinical threshold and source in `rules.json` and `guidance.json`, plus the LOINC codes in `src/app/export.ts`.
- `HR-P1-CLEAR` (team decision): a resting HR of 50-59, which is mildly low and never a red flag, is green when it sits inside the astronaut's own learned band. This stops false alarms for athletic hearts. It needs a flight-surgeon review, and you can switch it off with `clearsClinicalLow` in `rules.json`.
- Make the Hermes repo public (Space Apps requires reused work to be public before the event), then switch `src-tauri/Cargo.toml` to the git dependency noted there. Until then the desktop build needs a local Hermes checkout and CI does not build it.
