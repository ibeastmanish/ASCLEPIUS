# ASCLEPIUS: Space Apps 2026 project page (draft)

Paste each section into the matching field on spaceappschallenge.org. Field names follow the 2025 Project Submission Guide; **re-check them against the 2026 guide** and trim to any character limits it sets. Items in `[brackets]` need the team to fill in or confirm.

Challenge: **Create Health Monitoring Software for Astronauts on Space Missions**
Team: **ASCLEPIUS**, Warangal, India · Team member: **Tula Manish** (registered for the Warangal Local Event)

---

## Project Name
ASCLEPIUS: Medicine for when Earth is too far away

## High-Level Project Summary
ASCLEPIUS is an offline health self-check for astronauts that knows whether Earth can answer in time. Each day the astronaut logs the six readings in the brief (blood pressure, heart rate, blood sugar, temperature, sleep, mood). Each one is judged against the usual adult range and against the astronaut's own learned normal, and every colour shows its rule and source. Using the real Earth–Mars light time and Sun blackouts from NASA JPL Horizons and the NASA Mars24 sol clock, the Earth Reply Clock compares when the crew must act with when a flight surgeon's answer can arrive, and tells the crew when to decide on their own. Crew Pulse looks across the whole crew to separate one sick person from bad cabin air (NASA-STD-3001 CO2 limit) or a spreading infection. Run on NASA OSDR Inspiration4 blood data (OSD-569), the same engine finds a change in all four crew that the population range calls normal. On Earth, the same clock helps rural health workers near Warangal.

## Link to Project Demo
https://github.com/ibeastmanish/ASCLEPIUS/blob/main/pitch/ASCLEPIUS_SpaceApps2026_deck.pdf (7-slide deck, PDF; English; the same file is in the repository's `pitch/` folder)

## Link to Final Project
https://github.com/ibeastmanish/ASCLEPIUS · Live demo: https://ibeastmanish.github.io/ASCLEPIUS/ · Ground Station console: https://ibeastmanish.github.io/ASCLEPIUS/ground.html

## Detailed Project Description

**What it does**
- **Daily check (about one minute).** Six tiles, pre-filled from yesterday, with "how to measure" and "why this check" notes. Context chips (after exercise, after a meal, dizzy when standing, unwell…) change how a reading is judged, and warning symptoms (chest pain, fainting…) are always red.
- **Two ranges per reading.** The usual adult range (ACC/AHA, ADA, AASM/SRS, each cited) and a personal band learned from the astronaut's own checks (median ± 2.5 × scaled MAD, 7 or more checks). The worse result wins, and both ranges are shown side by side.
- **Body map.** Brain, heart, blood and skin light up green, yellow or red. Tapping a region shows what is happening, why it matters in space (NASA HRP hazards), what to do now, and when to tell the crew medical officer. Related signs become one card (fatigue pattern, possible infection, light-headed on standing).
- **Escalation ladder.** All good → do the steps and recheck tonight → tell the crew medical officer → act now (CMO alerted, Earth told). A pattern, a trend over three days, yellow on three of the last five days, or feeling unwell moves a yellow up a rung.
- **Earth Reply Clock.** For every finding: *earliest Earth answer* = light time there + flight surgeon response (on or off shift; the Mars sol drifts 39.6 min a day against Houston) + light time back, compared with the *act-by window* of the rule that fired. Three levels: Earth guides, act and Earth confirms, crew decides. During solar conjunction the crew always decides. Every input is shown with its source and marked real or assumed.
- **Crew Pulse.** The CMO's view across the crew: the same complaint in several crew on the same sol points to the cabin (cabin CO2 vs NASA-STD-3001's 3 mmHg limit); a fever moving from one crew member to the next 1–3 sols apart points to infection; whole-crew short sleep is a schedule problem; one person flagged is individual. Mood stays private.
- **Earth outbox and Ground Station.** Red alerts and daily digests are signed with the crew key and encrypted to the ground station's public key, with a sequence number, and queued with the real arrival time. A separate Ground Station console page receives each packet only after the real light time (or after the blackout), checks the signature, rejects replays, shows the exact decision snapshot the crew saw, and signs the surgeon's reply, which reaches the crew one light time later.
- **Trends, streaks and personal badges** (never comparing crew members); **optional camera capillary-refill check** (experimental, labelled); **JSON and HL7 FHIR R4 export**.
- **Delay is delay (Earth use).** Settings switch the far end from Earth to a rural clinic: the Reply Clock uses travel time and clinic hours instead of light time and the surgeon's shift. The daily check has a Telugu draft for community health workers near Warangal, Telangana.

**How it works**
React PWA with all logic on the device: no server, no internet after the first load. A pure TypeScript rules engine runs in a web worker: validity → red flags → clinical range → personal band → multi-day trend → patterns → overall (worst wins) → escalation → Reply Clock. Every threshold lives in a readable `rules.json` with its source (NASA-STD-3001 where it gives a limit, named terrestrial guidelines where it does not). **No AI is used to make health decisions.** Data is an append-only event log in IndexedDB, each event encrypted with AES-GCM-256 using a key derived from the passphrase (PBKDF2, 600,000 iterations). The Ground Station console is a second static page with its own keys and storage. 147 automated tests, including property tests, cover the rules, the clock, Crew Pulse, the crypto and the NASA-data proof.

**Benefits**
- One clear answer in about a minute, with the reason one tap away.
- Personal baselines catch changes a population range misses, shown on real NASA crew data.
- It says who decides, from the real delay, instead of a fixed rule.
- It tells one sick person apart from a cabin problem or a spreading infection.
- Everything is explainable, offline and encrypted.

**What we hope to achieve**
A self-assessment tool that crews on Artemis surface missions and future Mars missions could use, that flight surgeons can audit rule by rule, and that gives NASA's Earth-independent medical operations concept concrete autonomy levels. Next: a flight surgeon's review of every threshold, sealed tablet-to-tablet sync for Crew Pulse, Bluetooth device input.

**Use on Earth**
The constraints ASCLEPIUS is built for (no internet, help that is hours away, people who are not doctors checking themselves) also exist near our home in Warangal, Telangana, where the nearest doctor can be hours away for some villages. The rural clinic mode and the Telugu daily check are a first step; this use is proposed, not yet tested with such users, and the Telugu text awaits native review.

**Tools**
TypeScript, React 19, Vite, vite-plugin-pwa/Workbox, Dexie (IndexedDB), Recharts, WebCrypto, Tauri (Rust) with the team's `aura` OpenPGP library (Sequoia), Vitest + fast-check, Python (NASA data processing).

**Work done before the event (disclosure)**
The planning documents, the NASA data download (Nov 3, 2026) and the base application (engine, vault, body map, outbox, Nov 4, 2026) were built before the hackathon. Sandeep, the Local Lead for the Warangal event, approved using this pre-event work in writing on Nov 5, 2026 (email reply to Tula Manish, 5 Nov 2026, 18:41 IST, subject "NASA space apps": "You may continue your project."; a copy of the thread is available on request). The repository's `pre-event` git tag marks exactly what existed then. Built after that tag, under the same approval, on Nov 12–13 and during the event: the Earth Reply Clock, Crew Pulse, the Ground Station console, the corrected Inspiration4 analysis, the clinical rule fixes, the clinic mode and Telugu draft, and the demo materials. Work done during the event (Nov 14–15) is everything in the git history after commit `8a9491f` (Nov 13). `aura`, the team's earlier open-source OpenPGP library (MIT OR Apache-2.0), is reused unchanged in the desktop build only.

## NASA Data
- **NASA JPL Horizons API.** Daily Mars position as seen from Earth (target 499, centre 500@399; quantities 20 and 23), Nov 2026 – Dec 2029. Gives the real one-way light time for every date (11.0 min on 14 Nov 2026; 19.25 min on 14 Jan 2028) and the solar-conjunction blackout of 8 Mar – 3 Apr 2028. It drives the Earth Reply Clock, the outbox arrival times and the Ground Station's hold. https://ssd.jpl.nasa.gov/horizons/
- **NASA GISS Mars24 algorithm** (Allison & McEwen 2000). Mars local time for reminders and the sol drift against the flight surgeon's shift in the Reply Clock. https://www.giss.nasa.gov/tools/mars24/
- **NASA Open Science Data Repository, OSD-569** (Inspiration4 complete blood count) and **OSD-575** (metabolic panel). The proof screen runs the app's own band rule on the four crew members' three pre-flight draws. Result: the day after landing, all 4 had a red-cell size (MCV) below their own lowest pre-flight value, while all 4 stayed inside the 80–100 fL population range; 16 of 34 markers have an index of individuality under 0.6. Limits are stated on the screen (n = 4, 3-day flight, no in-flight draws; MCV still low months later in 3 crew, so a lab change may contribute). While doing this we found that row C003 L-92 of the submitted CBC file is column-shifted (MCH missing); the pipeline documents and corrects it, and is documented in `data/derived/README.md` so the OSDR team can correct the source file. https://osdr.nasa.gov/bio/repo/data/studies/OSD-569 · https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
- **NASA-STD-3001** Vol 1 Rev C and Vol 2 Rev F. Cited rule by rule: monitoring duties, the 8.5 h sleep period and 01:00–07:00 circadian low [V1 6001], behavioural health [V1 4011], private medical communication [V1 6002], hypothermia (App. C), the cabin CO2 limit of 3 mmHg [V2 6004], orthostatic intolerance (Table E.2-2). https://standards.nasa.gov/
- **NASA OCHMO-TB-004, Carbon Dioxide.** Headaches reported at 2.8–4.5 mmHg: the Crew Pulse cabin rule. https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf
- **NASA HRP, 5 Hazards of Human Spaceflight** (challenge Resources tab). Every body-map card names its hazard (isolation & confinement, gravity fields, hostile/closed environments, distance from Earth, radiation) in "Why it matters in space". The Reply Clock is built on the *Distance from Earth* hazard, and Crew Pulse's cabin rule on *Hostile/Closed Environments*. https://www.nasa.gov/hrp/hazards/
- **NASA HRP, Risks of Human Spaceflight** (Resources tab). Every guidance card links the exact HRP risks it relates to (25 cards, 9 risks): Cardiovascular Adaptations; Altered Sensorimotor and Vestibular Function (dizzy on standing); Altered Immune System Responses and Host-Microorganism Interactions (fever, spreading infection); Inadequate Food and Nutrition (blood sugar); Inadequate Sleep and Irregular Schedules; Behavioral Changes and Psychiatric Disorders; Inadequate Teamwork; Inadequate Systems Operations Support (warning symptoms). A test checks every card names at least one real risk. https://www.nasa.gov/hrp/risks/
- **NASA HRP, Ongoing HRP Research in Space** (Resources tab). Artemis II *Standard Measures* (a consistent daily set of measurements) shaped the fixed six-reading check; the Artemis II study of crew well-being, activity and sleep and the *Immune Biomarkers* study are cited in Crew Pulse's sleep-debt and infection rules. https://www.nasa.gov/hrp/ongoing-hrp-research/
- **NASA Earth-Independent Medical Operations concept of operations** (NTRS 20250000009): the idea the Reply Clock gives numbers to. https://ntrs.nasa.gov/citations/20250000009
- **NASA public-domain images** in the deck: Mars (NASA/JPL/USGS, PIA00407, https://photojournal.jpl.nasa.gov/catalog/PIA00407); Blue Marble (NASA, Apollo 17, AS17-148-22727, https://images.nasa.gov/details/as17-148-22727); Earthrise (NASA, Apollo 8, 1968) and an ISS crew blood draw (NASA), both from the NASA Image and Video Library, https://images.nasa.gov
- Provenance for every data file (URL, fetch time, size, SHA-256) is in `data/manifest.json`; `npm run data` and `npm run proof` rebuild the app data from the raw NASA files.

## Space Agency Partner & Other Data
- **CSA (Canadian Space Agency), Monitoring Radiation for Astronaut Health** (challenge Resources tab): linked from the radiation hazard explanation in the app as further reading on how neutron radiation (about 30% of the ISS dose) is measured. ASCLEPIUS does not measure radiation itself; we left a radiation feature out on purpose to keep the six-reading check focused. https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp
- Clinical reference ranges (terrestrial, cited in `rules.json`): ACC/AHA 2017 blood pressure guideline, NHLBI hypotension line, ADA Standards of Care (glucose), AASM/SRS adult sleep consensus.
- Viral reactivation background for Crew Pulse: Rooney et al. 2019, *Frontiers in Microbiology* (PMC6374706).
- Open-source code: React (MIT), Vite (MIT), vite-plugin-pwa / Workbox (MIT), Dexie (Apache-2.0), Recharts (MIT), Tauri (MIT OR Apache-2.0), Sequoia OpenPGP (LGPL-2.0-or-later), Vitest (MIT), fast-check (MIT), Ajv (MIT), fake-indexeddb (Apache-2.0), oxlint (MIT), TypeScript (Apache-2.0).
- The judged project is the web app (crew tablet + Ground Station), which uses only the open-source packages above. An optional desktop build additionally uses the team's own earlier OpenPGP library `aura`; that repository is not public yet, so the desktop build is not part of this submission and is not needed to run or judge ASCLEPIUS.
- ASCLEPIUS itself is released under the MIT licence.
- All crew data shown (Commander Asha Rao and her crew) is **simulated** and labelled as such on every screen.

## References
**NASA data and resources**
1. NASA JPL Horizons System, Mars (499) from Earth (500@399), light time and Sun–Earth–Mars angle, Nov 2026 – Dec 2029. https://ssd.jpl.nasa.gov/horizons/
2. NASA GISS Mars24 Sunclock algorithm (Allison & McEwen 2000). https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
3. NASA OSDR OSD-569, SpaceX Inspiration4 complete blood count. https://osdr.nasa.gov/bio/repo/data/studies/OSD-569
4. NASA OSDR OSD-575, SpaceX Inspiration4 comprehensive metabolic panel. https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
5. NASA-STD-3001 Vol 1 Rev C (2023) and Vol 2 Rev F (2026), NASA Space Flight Human-System Standard. https://standards.nasa.gov/
6. NASA OCHMO-TB-004, Carbon Dioxide technical brief. https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf
7. NASA HRP, 5 Hazards of Human Spaceflight. https://www.nasa.gov/hrp/hazards/
8. NASA HRP, Risks of Human Spaceflight. https://www.nasa.gov/hrp/risks/
9. NASA HRP, Ongoing HRP Research in Space (Artemis II studies). https://www.nasa.gov/hrp/ongoing-hrp-research/
10. NASA, Earth-Independent Medical Operations concept of operations, NTRS 20250000009. https://ntrs.nasa.gov/citations/20250000009
11. NASA images: Mars PIA00407 (NASA/JPL/USGS); Blue Marble AS17-148-22727; Earthrise (Apollo 8); ISS blood draw. https://images.nasa.gov

**Space agency partner**
12. Canadian Space Agency, Monitoring Radiation for Astronaut Health (2026). https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp

**Science and clinical references**
13. Rooney B.V. et al. (2019), Herpes virus reactivation in astronauts during spaceflight and its application on Earth, *Frontiers in Microbiology*. https://pmc.ncbi.nlm.nih.gov/articles/PMC6374706
14. Harris E.K. (1974), the index of individuality (within- vs between-person variation), *Clinical Chemistry*.
15. Whelton P.K. et al. (2017), ACC/AHA guideline for high blood pressure in adults; NIH NHLBI, Low Blood Pressure (90/60 line).
16. American Diabetes Association, Standards of Care in Diabetes (fasting, after-meal and hypoglycaemia levels).
17. AASM/SRS consensus on recommended sleep for adults (7 h or more).

**Open-source software** (licence)
18. React, Vite, vite-plugin-pwa / Workbox, Recharts, Vitest, fast-check, Ajv, oxlint (MIT); Dexie, fake-indexeddb, TypeScript (Apache-2.0); Playwright, pptxgenjs (Apache-2.0 / MIT, pitch build only); Tauri (MIT OR Apache-2.0, optional desktop build only).

**Tools**
19. Claude Code (AI coding assistant); see the SI section below.

ASCLEPIUS itself: MIT licence, https://github.com/ibeastmanish/ASCLEPIUS

## Use of Super Intelligence (SI / AI)
SI coding assistants (Claude Code) were used to research existing tools and competing entries, to write and test the application code and data-processing scripts, and to draft the documentation, the deck, the speech and this text. The team chose the direction, reviewed the health rules, the medical wording and the data analysis, and is responsible for all of it. AI-assisted code is acknowledged in the repository README and in the commit metadata ("Co-Authored-By" lines). ASCLEPIUS does **not** use AI to make health decisions: every result comes from a readable rule in `rules.json`. The Telugu strings are a machine-assisted draft and are labelled so in the app. No video is submitted, and no AI-generated images, video or audio are used; the deck uses NASA public-domain photographs and hand-drawn CSS/SVG art.

---

## Before you press Submit
- [x] Sandeep's written approval received (email, Nov 5, 2026, 18:41).
- [x] Team member named on the deck (slides 1 and 7), the speech and the team page: Tula Manish
- [x] Demo format: the 7-slide deck (≤ 7 slides incl. title, English, team member names on it)
- [x] Submission and Judging guides (published Nov 12) read: demo limits, SI disclosure, NASA data, deadline
- [x] Challenge Resources tab: all 3 NASA resources and 1 CSA resource used
- [ ] Ask Sandeep (same thread) to confirm the approval also covers Global Judging
- [ ] Push to GitHub; check the Actions run passes; open the live demo, ground.html and the deck link in a private window on a phone
- [ ] Email the OSDR team about the shifted row in OSD-569 (see `data/derived/README.md`)
- [ ] Copy each section above into the Project tab (opens Nov 14, 9:00 a.m. IST) and press Submit before **11:59 p.m. IST, Nov 15** (aim for 10 p.m.)
