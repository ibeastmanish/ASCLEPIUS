# HYGIEA: Space Apps 2026 project page (draft)

Paste each section into the matching field on spaceappschallenge.org. Field names follow the 2025 Project Submission Guide; **re-check them against the 2026 guide on Nov 13** and trim to any character limits it sets. Items in `[brackets]` need the team to fill in or confirm.

Challenge: **Create Health Monitoring Software for Astronauts on Space Missions**
Team: **HYGIEA**, Warangal, India · `[team member names, 1–6, all registered for the Warangal Local Event]`

---

## Project Name
HYGIEA: Health for the Artemis generation

## High-Level Project Summary
HYGIEA is an offline tablet app that turns a one-minute daily check of the six indicators in the brief (blood pressure, heart rate, blood sugar, temperature, sleep and mood) into a green, yellow or red answer on a clickable body map, with plain-language next steps. Its twist: **normal for everyone is not normal for you.** Each reading is checked against the usual adult range **and** against the astronaut's own learned normal, and the worse result wins. NASA OSDR data from SpaceX Inspiration4 (OSD-569) shows why: the day after landing, all four crew members' lymphocyte counts were inside the lab's normal range, yet all four had moved more than 20% from their own pre-flight level. Mars is 5 to 20 minutes away by radio (NASA JPL Horizons), so the crew acts first: red alerts go to Earth signed and encrypted, showing when they arrive. The same offline design fits rural clinics on Earth.

## Link to Project Demo
`[public link to the ≤30-second video (English captions) OR the ≤7-slide deck — choose ONE, no login required]`

## Link to Final Project
`[public GitHub repo, e.g. https://github.com/ibeastmanish/hygiea]` · Live demo: `[https://ibeastmanish.github.io/hygiea/]`

## Detailed Project Description

**What it does**
- **Daily check (about one minute).** Six tiles, pre-filled from yesterday, with "how to measure" and "why this check" notes on each one. Readings that are steady and inside the astronaut's normal for 7 days are asked every 2–3 days instead, to save crew time.
- **Two ranges per reading.** Each reading is checked against the usual adult range (AHA/ACC, ADA, AASM/SRS) and against a personal band learned from the astronaut's own checks (median ± 2.5 × scaled MAD, learned from 7 or more checks, drifting slowly only on green days). The result shows both ranges side by side.
- **Body map.** Brain, heart, blood and skin regions light up green, yellow or red. Tapping a region shows what is happening, why it matters in space (linked to NASA's five hazards of human spaceflight), what to do now, and when to tell the crew medical officer.
- **Patterns, not alarm floods.** Related signs are combined into one card. For example, short sleep, a raised heart rate and a low mood on the same day become one "Fatigue pattern" card.
- **Escalation ladder.** Each result maps to one of four steps: all good, do the steps and recheck tonight, tell the crew medical officer, or act now. "Act now" alerts the crew medical officer and sends a summary to Earth. Warning symptoms such as chest pain or fainting are always red and can never be skipped.
- **Earth outbox.** Red alerts and daily summaries are signed and encrypted, then queued with a real arrival time computed from the Mars–Earth light time. During solar conjunction (8 Mar – 3 Apr 2028), when the Sun blocks the radio link, messages are held and released automatically afterwards.
- **Trends and gamification.** Charts show each reading against the personal band over time, plus streaks and badges. Badges are personal: HYGIEA never compares crew members.
- **Optional camera perfusion check (experimental).** The brief lists camera images as a valid input. HYGIEA offers an optional seventh check: capillary refill time measured with the device camera, with a manual stopwatch fallback. It is kept separate from the six core readings and labelled as not clinically validated.

**How it works**
React PWA with all logic on the device: no server and no internet needed after the first load. A pure TypeScript rules engine runs in a web worker and applies, in order: input validity → red flags → clinical range → personal band → multi-day trend → patterns → overall (worst wins) → escalation. Every threshold lives in a readable `rules.json` with its source. Every colour carries its rule ID, value, band and source, and **no AI is used to make health decisions**. Data is stored in an append-only event log in IndexedDB, with each event encrypted with AES-GCM-256 using a key derived from the passphrase (PBKDF2, 600,000 iterations). A desktop build (Tauri) signs and encrypts Earth messages with OpenPGP through the team's open-source Hermes library. Records export as JSON or HL7 FHIR R4.

**Benefits**
- The check takes about a minute and reads at a glance.
- Personal baselines catch changes a population range misses.
- Every result is explainable and traceable to a rule and its source.
- It works with no connection to Earth.
- It respects privacy: health data stays encrypted on the device.

**What we hope to achieve**
A self-assessment tool that crews on Artemis surface missions and future Mars missions could actually use, and that flight surgeons can audit rule by rule. Next steps: review of every threshold by a flight surgeon, Bluetooth input from medical devices, and syncing between crew tablets.

**Use on Earth**
The constraints HYGIEA is built for (no internet, help that is minutes or hours away, and people who are not doctors checking themselves) also exist on Earth: Antarctic and polar research stations, submarine and offshore crews, and rural primary health centres. Near our home in Warangal, Telangana, connectivity in some villages is intermittent and specialist doctors can be hours away. Because HYGIEA runs fully offline, keeps data encrypted on the device and explains every result in plain words, the same app could support community health workers there. A Telugu and Hindi version is the first step after the hackathon. This use is proposed, not yet tested with such users.

**Earth link timeline**
Every red alert and daily digest shows three times: when it was sent from Mars, when Earth receives it, and the earliest moment a doctor's reply can arrive (for example 13:53 → 14:04 → 14:15 UTC on Nov 14, 2026). These come from the light delay alone, which is the physics minimum; waiting for a relay orbiter or a free Deep Space Network dish can add more.

**Tools**
TypeScript, React 19, Vite, vite-plugin-pwa/Workbox, Dexie (IndexedDB), Recharts, WebCrypto, Tauri (Rust), Hermes `aura` (OpenPGP via Sequoia), Vitest + fast-check (91 unit and property tests), Python (NASA data processing).

**Work done before the event (disclosure)**
Parts of HYGIEA were built before the hackathon: the planning documents, the NASA data download (Nov 3, 2026) and the application code (Nov 4, 2026). Sandeep, the Local Lead for the Warangal event, approved using this pre-event work in writing on Nov 5, 2026 (email thread: `[link to docs/local-lead-approval.pdf in the repo]`). The repository's `pre-event` git tag marks exactly what existed before Nov 14. Hermes, the team's earlier open-source project (MIT OR Apache-2.0), is reused unchanged for OpenPGP signing in the desktop build. Work done during the event (Nov 14–15): `[list it, e.g. datasets from the challenge Resources tab, final demo video and deck, UI changes]`.

## NASA Data
- **NASA JPL Horizons API.** Daily Mars position as seen from Earth (target 499, centre 500@399; quantities 20 and 23 for light time and Sun–Earth–Mars angle), Nov 2026 – Dec 2029. Used to compute the real one-way radio delay for every date (11.0 min on 14 Nov 2026; range 5.4–20.1 min) and the solar-conjunction blackout of 8 Mar – 3 Apr 2028. This drives the arrival times in the Earth outbox and the "act first, report after" guidance. https://ssd.jpl.nasa.gov/horizons/
- **NASA Open Science Data Repository (OSDR), OSD-569:** SpaceX Inspiration4 complete blood count. **OSD-575:** Inspiration4 comprehensive metabolic panel. Used on the Crew Reference screen to compare personal and population ranges with real crew data. Finding: the day after landing, all four crew members' lymphocyte counts were inside the lab's normal range, yet all four had moved more than 20% from their own pre-flight level (−26.8%, −27.3%, −33.9%, +20.7%). Shown as an illustration of the idea, not as clinical evidence (4 civilians, a 3-day flight). The 20% cut-off is project-defined. HYGIEA's own band rule needs 7 checks; run on Inspiration4's 3 pre-flight draws it flags 1 of 4 for lymphocytes, because a band from 3 points is too wide to trust. The Crew screen shows both numbers, and this is why the app waits for 7 daily checks before switching a personal band on (`analysis/inspiration4_baseline.py`). https://osdr.nasa.gov/bio/repo/data/studies/OSD-569 · https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
- **NASA Human Research Program: five hazards of human spaceflight.** The basis for the "why it matters in space" text on every guidance card. https://www.nasa.gov/hrp/hazards/
- **NASA public-domain images** used in the deck and video: Blue Marble, Earthrise, Mars, ISS blood draw, and Tim Peake aboard the ISS. `[add the source page URL for each image]`
- Provenance for every file (URL, fetch time, size, SHA-256) is in `data/manifest.json`, and `npm run data` rebuilds the app data from the raw NASA files.

## Space Agency Partner & Other Data
- `[add any partner-agency resources listed on the challenge Resources tab on Nov 13 that you use]`
- Clinical reference ranges: AHA/ACC 2017 blood pressure categories, ADA glucose categories, AASM/SRS adult sleep recommendation (each cited in `rules.json`, marked for verification).
- Open-source code: React (MIT), Vite (MIT), vite-plugin-pwa / Workbox (MIT), Dexie (Apache-2.0), Recharts (MIT), Tauri (MIT OR Apache-2.0), Sequoia OpenPGP (LGPL-2.0-or-later), Vitest (MIT), fast-check (MIT), Ajv (MIT), fake-indexeddb (Apache-2.0), oxlint (MIT), TypeScript (Apache-2.0).
- Team's own earlier open-source work: Hermes `aura` (MIT OR Apache-2.0), `[https://github.com/ibeastmanish/hermes — must be public before submission]`.
- HYGIEA itself is released under the MIT licence.
- All crew data shown (Commander Asha Rao) is **simulated** and labelled as such on every screen.

## Use of Super Intelligence (SI / AI)
SI coding assistants (Claude Code) were used to help write and test the application code, the data-processing scripts, the documentation and this project text. The team reviewed the health rules, the medical wording and the data analysis. HYGIEA does **not** use AI to make health decisions: every result comes from a readable rule in `rules.json`. `[If the synthesized voice-over is kept: "The demo video's voice-over is synthesized with macOS text-to-speech." Delete this if a teammate records it.]` `[List any other AI-generated images, video or audio. If there are any, they need a visible "AI-generated" watermark, and they must not show NASA logos or branding. Edit this section so it matches exactly what the team did.]`

---

## Before you press Submit
- [x] Sandeep's written confirmation received (email, Nov 5, 2026, 18:41). Save the whole thread as a PDF.
- [ ] Sandeep confirms (same email thread) that the approval also covers Global Judging; thread saved as `docs/local-lead-approval.pdf`
- [ ] `pre-event` git tag pushed, so judges can see what was built at the event
- [ ] Human voice-over recorded over `video_build/HYGIEA_SpaceApps2026_demo_30s_no-voiceover.mp4` (or the SI disclosure above kept)
- [ ] Team member names added to the deck title slide and team page
- [ ] Hermes repo public; `src-tauri/Cargo.toml` switched to the git dependency
- [ ] 2026 guides read on Nov 13 (field names, demo limits, SI rules)
- [ ] At least one dataset from the challenge Resources tab used and listed above
- [ ] Demo: video ≤ 30 s with English captions, **or** deck ≤ 7 slides (not both)
- [ ] All links public, no login needed
- [ ] Every `[VERIFY]` threshold in `rules.json` checked
- [ ] Every member registered for the Warangal event and listed on the team page
- [ ] Submitted before 11:59 p.m. local time on Nov 15
