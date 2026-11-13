# ASCLEPIUS
### *Medicine for when Earth is too far away.*

**Live demo:** https://ibeastmanish.github.io/hygiea/ · **Ground Station console:** https://ibeastmanish.github.io/hygiea/ground.html · [![CI](https://github.com/ibeastmanish/hygiea/actions/workflows/ci.yml/badge.svg)](https://github.com/ibeastmanish/hygiea/actions/workflows/ci.yml)

ASCLEPIUS is an offline tablet app for astronauts. A one-minute daily check of six readings (blood pressure, heart rate, blood sugar, temperature, sleep, mood) becomes one clear answer: green, yellow or red, explained on a clickable body map, with what to do next. Then it answers the question the challenge asks: **when does this need the crew, and when does it need the flight surgeon on Earth?**

> **Normal for everyone is not normal for you.** A resting heart rate of 74 is fine for most people. For an astronaut whose own normal is 52-62, it is a warning sign. Every reading is checked against the usual adult range **and** the astronaut's own learned normal. The worse result wins.

> **Earth cannot always answer in time.** Mars is 4 to 22 minutes away by radio, each way, and for about three weeks every two years the Sun blocks the link completely. The **Earth Reply Clock** compares *when you must act* with *when Earth's answer can arrive*, and says who decides.

Built for the NASA Space Apps Challenge 2026, *Create Health Monitoring Software for Astronauts on Space Missions*. Team ASCLEPIUS, Warangal, India.

**Decision support, not a medical device.** ASCLEPIUS does not diagnose. Every colour comes from a readable rule with a source, never from AI.

---

## What is new in v3 (and, as far as we could find, in no other entry)

| | What it does | Where |
|---|---|---|
| **Earth Reply Clock** | For every yellow or red: *earliest Earth answer* = light time there (real, NASA JPL Horizons for that date) + flight surgeon response (depends on whether they are on shift; a Mars sol is 39.6 min longer than a day, so the crew's morning drifts against Houston) + light time back. Compared with the *act-by window* of the rule that fired. Three levels: **Earth guides**, **act, Earth confirms**, **crew decides**. During the Sun blackout the crew always decides. NASA's Earth-Independent Medical Operations concept says decisions move to the crew when the delay is too long; this gives it numbers. | `src/engine/replyclock.ts`, Home, Body map, red alert |
| **Crew Pulse: one, some, or all** | The CMO's view across the 4-person crew. The same complaint in 2+ crew on the **same sol** points to the cabin (cabin CO2 vs NASA-STD-3001's 3 mmHg limit). A fever moving from one person to the next **1-3 sols apart** points to infection. Crew-median sleep under 6 h for 3 sols is a schedule problem. One person flagged is individual. Mood is never shown to the CMO. | `src/engine/crewpulse.ts`, `#/pulse` |
| **Proof, computed by the product** | The app's own band rule run on NASA OSDR OSD-569 (Inspiration4). The day after landing, **all 4 crew had a red-cell size (MCV) below their own lowest pre-flight value, while all 4 stayed inside the 80-100 fL population range.** 16 of 34 blood markers have an index of individuality under 0.6. We also found and fixed a column-shifted row in the NASA file (see below). | `analysis/i4_proof.py`, `scripts/proof.mjs`, `#/crew` |
| **Ground Station console** | A second static page, with its own key pair. The crew tablet holds only the ground's public key. Packets arrive **after the real light time** for their date (or after the blackout), are decrypted with the station key, their crew signature checked, and their sequence number checked against replays. The surgeon's reply is signed and reaches the crew one light time later. | `ground.html`, `src/ground/` |
| **Delay is delay** | The same Reply Clock for a community health worker near Warangal: the far end is the clinic, the delay is travel time, the shift is the clinic's hours. The daily check has a Telugu draft. | Settings → Earth use |

## 60-second quick start
1. Open the live demo (it works on a phone). Choose any passphrase of 8 or more characters. Keep **Load the simulated crew member** ticked. You are Commander Asha Rao (fictional) on Day 212 at a Mars base.
2. **Start check.** Set heart rate **74**, sleep **5.2**, mood **3**, then **Finish check**.
3. The **body map** glows yellow at the brain and heart with one *Fatigue pattern* card, the ladder says **tell the crew medical officer** (a pattern plus three short nights), and the **Earth Reply Clock** shows Earth can answer in time for a yellow. Tap **Heart** → **Why this colour?**: 74 bpm is inside 60-100 for adults but above *her* normal of 52-62.
4. **Crew Pulse** (menu 6.0): today 3 of 4 crew have a headache or short sleep and cabin CO2 reads 3.4 mmHg: *suspect the cabin, not the person*. Below it, a fever moved from Kwame to Mei two sols apart.
5. Do another check with blood sugar **48**. The full-screen **Act now** alert shows the Reply Clock: Earth's earliest answer 27 min, you must act within 10 min, **crew decides**. The crew medical officer is alerted and a signed, encrypted summary goes to the **Earth outbox**.
6. Open the **Ground Station console** in a second tab (link at the bottom of the Outbox). Switch on **×60 time warp**; the packet arrives after "11 minutes", the signature is checked, the surgeon writes a reply, and the crew tablet shows **Earth answered** 22 min later. Try **Replay test**: the same packet is rejected.
7. **Settings → Mar 20, 2028** replays the Sun blackout: messages are held until Apr 4, 2028, and every finding becomes *crew decides*.

Scripted, repeatable demo views (simulated data, nothing stored): `?video=check`, `?video=bodymap`, `?video=alert`, `?video=pulse`, `?video=proof`, `?video=outbox`.

## How it works
```
 UI (React) ──postMessage──► ENGINE WORKER (pure TypeScript, rules.json v3.0.0)
   ▲                           validity → red flags → clinical → personal → trend
   │ results                   → patterns → overall (worst wins) → escalation
   │                           → Earth Reply Clock (act-by vs earliest answer)
   │                                    │
   │                         EVENT LOG (IndexedDB via Dexie, append-only)
   │                         each event AES-GCM 256 encrypted; key from passphrase
   └──── projections ◄──────────────────┤  (PBKDF2-SHA-256, 600,000 iterations), memory only
         today, trends, baselines,      ▼
         crew pulse, streak       OUTBOX: red alert > daily digest, sequence-numbered
                                  CBOR + gzip, ECDSA P-256 signed (crew key),
                                  ECDH P-256 + AES-GCM encrypted to the GROUND PUBLIC key
                                        │  BroadcastChannel / paste / file (demo DSN)
                                        ▼
                         GROUND STATION CONSOLE (ground.html, its own keys and storage)
                         holds each packet for the real light time, verifies, triages, signs replies
          No server. No internet needed after the first load.
```

| Layer | What it does | Where |
|---|---|---|
| Validity | Impossible values are never coloured: "Please re-measure" | `src/engine/evaluate.ts` |
| Red flags | Crisis values and warning signs are red at once; nothing can skip them. Includes low blood pressure (< 80/40) and hypoglycaemia (< 54 mg/dL) | `rules.json` |
| Clinical | Usual adult ranges, each with its source: ACC/AHA 2017 (blood pressure, incl. the 90/60 low line), ADA (fasting and after-meal glucose), AASM/SRS (sleep), NASA-STD-3001 (hypothermia). NASA-STD-3001 gives no numeric BP, HR or glucose limits, so those are labelled terrestrial | `rules.json` |
| Personal | median ± 2.5 × scaled MAD of your own checks, minimum half-width, learned from 7+ checks; the width is fixed once learned and only the centre drifts (EWMA α 0.05) from green checks, so a slow decline cannot hide itself | `src/engine/baseline.ts` |
| Trend | 3 short nights, 3 low-mood days, 3 days of raised HR, < 4 h sleep two nights running | `rules.json` |
| Patterns | One card instead of several alerts: `PT-FATIGUE`, `PT-FEVER`, `PT-ORTHO` (dizzy on standing with low systolic pressure, the classic post-landing problem) | `src/engine/evaluate.ts` |
| Escalation | none → recheck tonight → tell the CMO → alert the CMO + Earth. A pattern, a multi-day trend, yellow on 3 of the last 5 days, or feeling unwell moves a yellow up to *tell the CMO* | `src/engine/escalate.ts` |
| Reply Clock | act-by window (per rule) vs earliest Earth answer (Horizons light time, blackout, surgeon shift, Mars-sol drift, optional contact windows); every input shown with its source and marked real or assumed | `src/engine/replyclock.ts` |
| Crew Pulse | one / cabin / spreading / sleep-debt rules across the crew's last 7 sols | `src/engine/crewpulse.ts` |

Every result carries its **why**: rule ID, layer, value, band, source and rules version. The Ground Station receives exactly that snapshot, with a hash of the rule set, so the surgeon sees what the crew saw.

## NASA data
| Source | Used for | Files |
|---|---|---|
| **NASA JPL Horizons API** (Mars 499 from Earth 500@399, quantities 20 and 23, daily Nov 2026 to Dec 2029) | Light time for every date (11.0 min on Nov 14, 2026; 19.25 min on Jan 14, 2028), Sun blackout Mar 8 to Apr 3, 2028. Drives the Reply Clock, the outbox arrival times and the Ground Station hold | `data/raw/horizons_earth_mars.json` → `src/data/horizons_delay.json` |
| **NASA GISS Mars24** algorithm (Allison & McEwen) | Mars local time for reminders, and the sol drift against the flight surgeon's shift | `src/engine/mars.ts` |
| **NASA OSDR OSD-569** (SpaceX Inspiration4 complete blood count) and **OSD-575** (metabolic panel) | The proof screen: MCV, 4 of 4 crew; index of individuality for 34 markers | `data/raw/LSDS-7_…CBC…csv`, `LSDS-8_…CMP…csv` → `data/derived/`, `src/data/i4_proof.json` |
| **NASA-STD-3001** Vol 1 Rev C and Vol 2 Rev F | Cited rule by rule: monitoring duties [V1 3003/3004], sleep [V1 6001], behavioural health [V1 4011, 6010], private medical communication [V1 6002], hypothermia (App. C), cabin CO2 [V2 6004], orthostatic intolerance (Table E.2-2) | `rules.json`, `guidance.json`, `crewpulse.ts` |
| **NASA OCHMO-TB-004** (carbon dioxide) | Headaches at 2.8-4.5 mmHg: the Crew Pulse cabin rule | `src/engine/crewpulse.ts` |
| **NASA Human Research Program** hazards and risks | "Why it matters in space" on every card; sleep-loss and behavioural risks | `src/content/guidance.json` |
| **NASA EIMO concept of operations** (NTRS 20250000009) | The idea behind the Reply Clock's autonomy levels | `rules.json` → `replyClock.concept` |

**Headline finding (`npm run proof`):** in OSD-569, the day after landing all 4 Inspiration4 crew had an MCV below their own lowest pre-flight draw (C001 90.1 vs 92.8; C002 90.5 vs 93.6; C003 88.7 vs 91.3; C004 87.0 vs 89.6 fL), while all 4 were inside the 80-100 fL population range. Run through the app's own band rule, 4 of 4 are outside their band. **Limits, stated on the screen too:** 4 people, 3 pre-flight draws, a 3-day flight, no in-flight draws; MCV is still low at R+194 in 3 crew, so a lab or analyser change may be part of it. This is *consistent with* a personal change after flight; it does not prove one.

**A data error we found:** in the submitted OSD-569 file, row `C003_whole-blood_L-92_cbc` is missing MCH, so every value from MCHC onward sits one column to the right (its "lymphocytes 6826" is really the neutrophil count: 71.1% × 9.6k). `analysis/i4_proof.py` detects the shift, moves the values back, checks that the percentages reconcile, and writes `data/derived/cbc_corrected.csv` with a README. The raw NASA file is kept untouched. An earlier version of this project claimed "hidden lymphocyte drift in 4 of 4 crew" from the shifted row; with the fix that claim does not hold (C003 +0.1%, C004 +20.7%) and it has been withdrawn.

Provenance (URL, fetch time, size, SHA-256): [`data/manifest.json`](data/manifest.json).
```bash
npm run data          # regenerates src/data/*.json from data/raw (CI checks there is no diff)
npm run proof         # corrected CBC + src/data/i4_proof.json, then the engine cross-check
npm run data:fetch    # re-downloads from NASA (optional)
```

## Simulated vs. real data
- **Simulated:** Commander Asha Rao and her crew (Tomas Lindqvist, Mei Nakamura, Kwame Mensah) and all their readings, generated through the real engine (`src/seed/`), labelled *Simulated crew data* on every screen. Houston shift hours, surgeon response times, act-by windows and the cabin CO2 value are assumptions, labelled as such.
- **Real:** JPL Horizons light time and blackout; Mars24 time; Inspiration4 blood data; every NASA-STD-3001 and OCHMO limit cited.

## Optional: camera perfusion check (experimental)
The brief names camera images as a valid input. ASCLEPIUS offers an optional seventh check: capillary refill time. The astronaut presses a fingertip over the camera lens for five seconds, releases it, and `src/engine/crt.ts` times how long the frame brightness takes to recover with plain signal processing (no ML). A manual stopwatch is always offered too. It never joins the required six readings, the streak or the badges. The thresholds are project-defined and this self-test is not clinically validated.

## Run locally
```bash
npm install
npm run dev          # https://localhost:5173 (self-signed; WebCrypto and the camera need a secure context)
npm test             # 147 unit + property tests (Vitest + fast-check)
npm run build        # dist/: the PWA (index.html) and the Ground Station console (ground.html)
```

## Desktop app (Tauri + OpenPGP)
The same app as an installed program. The one difference is that Earth messages are signed and encrypted with OpenPGP through the team's earlier open-source library (`aura`, built on Sequoia; repository name "Hermes", unrelated to NASA TRISH's HERMES platform) instead of WebCrypto. The Rust side (`src-tauri/src/lib.rs`) exposes `hermes_unlock`, `hermes_lock`, `hermes_status`, `hermes_seal`, `hermes_open` and `hermes_erase`.
```bash
git clone <hermes repo> ../hermes   # needs Rust (rustup)
npm run desktop:test       # Rust tests: round trip, one-bit tamper, forged signer, wrong passphrase, keys persist
npm run desktop:selftest   # builds the app, runs the full flow inside the real desktop window
npm run desktop:build      # ASCLEPIUS.app + .dmg in src-tauri/target/release/bundle/
```

## Tests (147)
- Every rule at, just below and just above each threshold, driven from `rules.json` (schema-validated with Ajv). No `[VERIFY]` marker is left in shipped rules (a test checks).
- Property tests (fast-check): invalid input is never coloured; overall is never greener than any result; a red-flag value is always red, whatever the context chips; any symptom makes the check red; escalation always matches the colour.
- Clinical v3: low BP yellow/red, after-meal glucose, HR athlete-clear only from 50 bpm, PT-ORTHO, 3-day trends and 3-of-5 yellow days tell the CMO.
- Reply Clock: Mars red is *crew decides* (27 min answer vs 10 min window), Moon is *Earth consulted*, the same finding changes level at 4 vs 22 min, off-shift waits, blackout always *crew decides*, Mars-sol drift realigns within 37 sols, clinic mode.
- Crew Pulse: each pattern, plus the negatives (different days is not "same day"; 4 sols apart is not "spreading"; the same person twice is not "spreading"); the simulated crew is deterministic.
- Proof: `i4_proof.json` invariants; the shift fix reconciles.
- Vault round trip; wrong passphrase can't read; the data on disk is ciphertext. Key separation: the crew ring holds no ground private key, and old rings are migrated. A one-bit tamper fails decryption; a changed **signed body** (re-encrypted correctly) fails the **signature**; a re-signed body with a forged key fails; a replayed sequence number is rejected; packets are held for the real light time and through the blackout.
- Journey J3 is reproduced from the seeded persona. A full check evaluates in about 1 ms.

## Privacy and security
- All data stays on the device in IndexedDB. Each event is encrypted with AES-GCM 256; the key comes from your passphrase and is kept only in memory.
- Earth messages are signed with the crew key (ECDSA P-256) and encrypted to the ground station's **public** key (ECDH P-256 + AES-GCM 256). The ground private key lives only in the Ground Station console's own storage. The shipped *demo* station keys are public knowledge (they are in this repository); a real deployment generates new station keys in the console and pairs the tablet with them.
- Nothing leaves the device unless you export it (JSON or HL7 FHIR R4) or a red alert or daily digest is queued for Earth.
- Crew Pulse never shows mood or notes to the CMO.

## Licences and credits
ASCLEPIUS is MIT-licensed (see `LICENSE`). Desktop build: Tauri (MIT OR Apache-2.0), `aura` (MIT OR Apache-2.0), Sequoia OpenPGP (LGPL-2.0-or-later, linked as a library). Dependencies: React (MIT), Vite (MIT), vite-plugin-pwa / Workbox (MIT), Dexie (Apache-2.0), Recharts (MIT), Vitest (MIT), fast-check (MIT), Ajv (MIT), fake-indexeddb (Apache-2.0), oxlint (MIT), TypeScript (Apache-2.0).
NASA data and documents are public: JPL Horizons, GISS Mars24, OSDR (OSD-569, OSD-575), NASA-STD-3001, OCHMO-TB-004, HRP, NTRS.

## Known limits and next steps
- Thresholds for blood pressure, heart rate and glucose are terrestrial guidelines; a flight surgeon's review is the next step. `HR-P1-CLEAR` (50-59 bpm inside your own band is green) is a team decision, switchable in `rules.json`.
- The Telugu daily check is a machine-assisted draft awaiting native review (`docs/i18n`).
- Crew Pulse runs on one device for the demo; sealed tablet-to-tablet sync is future work.
- The desktop build needs the `aura` repository public before it can be built in CI.
