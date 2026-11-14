# ASCLEPIUS v3: Product Requirements

**Medicine for when Earth is too far away.**

| | |
|---|---|
| Version | 3.0, written 2026-11-12 (two days before the event) |
| Event | NASA Space Apps Challenge 2026, Warangal Local Event, **Nov 14 09:00 → Nov 15 23:59 IST** |
| Challenge | *Create Health Monitoring Software for Astronauts on Space Missions* (Intermediate) |
| Replaces | `HYGIEA_PRD.md`, `ASCLEPIUS_PRD_v2.md` (kept for history) |
| Code | `hygiea/` (folder and GitHub repo keep the old name; product name is ASCLEPIUS) |
| Evidence | `research_notes/v3_evidence/` and the "Evidence" section at the end |

---

## 1. The decision in one page

### 1.1 What we learned (Nov 12 research, four parallel investigations)

1. **Our current pitch is no longer unique.** About **60 public GitHub repos** already target this exact challenge. One of them ("Horizon", `EishaTahir-code/astronaut-health-prac`) is close to a copy of our feature list: offline PWA, six readings, traffic-light result, clickable body, "change from your usual", an outbox that waits for the signal delay, badges. Personal baselines appear in ~30 repos, radiation/DONKI in ~32, flight-surgeon views in ~20. A judge who has seen five of these will not remember a sixth.
2. **Our headline science claim is wrong.** The Inspiration4 blood file we use (OSDR OSD-569, `LSDS-7_..._TRANSFORMED.csv`) has a **shifted row**: crew C003, draw L-92 is missing MCH, so every value after it sits one column off ("lymphocytes 6826" is really the neutrophil count; "platelets 12.9" is really RDW). With the row fixed, the "4 of 4 crew had hidden lymphocyte drift" story collapses (C003 +0.1%, C004 **+20.7%**, a rise). Verified by hand on Nov 12.
3. **NASA data does not drive any health decision today.** JPL Horizons only changes message timing. Inspiration4 is an illustration on one screen. HRP hazards are prose. The 2025+ Relevance criterion asks whether NASA data is "a core component", and right now it is not.
4. **Judges currently see nothing.** The live demo and the GitHub repo return **404** to a logged-out visitor.
5. **Bugs a judge would hit in the first minute** (Home says "0/7 learning" for an astronaut with 225 checks; the `?video=check` route submits stale numbers; the ladder copy contradicts the result; 8 px sideways scroll on phones).
6. **Clinical holes a flight surgeon on the panel will find** (no low blood pressure rule at all; three days of rising heart rate never reaches the crew medical officer).

### 1.2 What we change

We stop competing as "a better health dashboard". We keep everything that works and put three things on top that, as far as four searches could find, **no competitor and no NASA tool does**:

| Pillar | One line | Why it is new |
|---|---|---|
| **A. Earth Reply Clock** | For every finding, compare *when you must act* with *when Earth's answer can arrive*, and set the crew's autonomy level from that. | NASA's own Earth-Independent Medical Operations concept (NTRS 20250000009) shifts decisions to the crew when the ground is "communication-delayed beyond practicality" but defines no levels tied to the delay. Competitors show a delay countdown; none decides *who decides*. We use the real light-time (JPL Horizons), the real Sun blackout, and the Mars-sol drift that decides whether the flight surgeon on Earth is even awake (NASA GISS Mars24). |
| **B. Crew Pulse: one, some, or all** | Look across the 4-person crew: a flag in one person is about that person; the same symptoms in several people on the same day point to the cabin (CO2); a fever that moves from one person to the next over 1-3 days points to infection. | No repo found does cross-crew, time-ordered reasoning. Backed by NASA OCHMO CO2 brief (headache 2.8-4.5 mmHg) and NASA-STD-3001 V2 6004 (3 mmHg 1-hour limit), and by herpes-virus reactivation data (53% Shuttle, 61% ISS astronauts shed virus, mostly without symptoms). |
| **C. The proof, computed by the product** | Run the app's own engine on real NASA crew blood data and show the exact case where population ranges say "fine" and personal ranges say "changed". | Replaces the broken lymphocyte claim with a verified one: **all 4 Inspiration4 crew had a lower red-cell size (MCV) the day after landing than in any of their own 3 pre-flight draws, while all 4 stayed inside the 80-100 fL population range.** We also found and corrected a data error in the NASA file, and we say so. |

Plus one Earth story that reuses Pillar A unchanged: **"Delay is delay."** For a community health worker near Warangal, the delay is not light-time but the hours to the nearest doctor. The same clock decides what she should do now. One screen in Telugu.

### 1.3 The sentence judges should repeat

> ASCLEPIUS knows whether Earth can answer in time, and tells the crew what to do when it cannot.

### 1.4 Name and tagline

Asclepius is the Greek god of medicine; his rod is still the symbol of medicine. The old tagline "Health for the Artemis generation" was justified by Hygieia's family tree and no longer fits. New tagline: **"Medicine for when Earth is too far away."**

---

## 2. Hard rules (any one of these ends the project)

Re-check every line against the 2026 Project Submission Guide and Judging & Awards Guide when they are published on **Nov 13**.

| Rule | What we do |
|---|---|
| Demo is **either** a video of 30 s or less **or** 7 slides or fewer, not both. Over the limit = not eligible for Global Judging. English subtitles. | Submit **the 30 s video**. One format only. |
| Every link opens with no login or permission. | Repo public, Pages live, video public on YouTube. Two team members test every link in a private window before submitting. |
| Must use NASA data or resources. Relevance scores whether it is core. | Pillars A and C make NASA data drive decisions (Section 6). |
| Submission closes **23:59 Warangal time, Nov 15**. No edits after. | Target submit at 22:00. |
| Third-party code must be public or OSI-licensed. | All libraries used are MIT or Apache-2.0. |
| SI (AI) use must be disclosed; AI audio acknowledged; AI images watermarked; no NASA logo imitations. | Keep the SI disclosure in SUBMISSION.md; human voice-over; no meatball/worm. |
| Team ≤ 6, each member registered for the Warangal event. | Confirm on Nov 13. |

### 2.1 Technical Considerations

- **Hermes name clash:** NASA's TRISH already runs a crew-health data platform called HERMES. Our OpenPGP library has the same name. In the pitch, call it "our open-source OpenPGP signing library"; keep it out of the video. The Hermes repo must be public (third-party rule) or the desktop build must be left out of the submission.

---

## 3. Users and the demo story

**Real user:** an astronaut on a Mars surface mission, crew of 4, no doctor on board, Earth 4-22 minutes away by light and sometimes completely cut off by the Sun.
**Second user:** the Crew Medical Officer (CMO), a crew member with medical training, not a doctor.
**Third user:** the flight surgeon on Earth.
**Primary audience right now:** judges. Local judges in Warangal first (the local gate is the biggest cut: ~11% of submissions become Global Nominees), then NASA subject experts, then NASA executives.

**The demo story (all simulated crew, always labelled):**
Commander Asha Rao, Sol 212 at Jezero. Her morning check is yellow: her heart rate is normal for most people but not for her. Two other crew also logged a headache and poor sleep today. ASCLEPIUS says: *"3 of 4 crew, same day: likely the cabin air, not you. Check CO2."* That evening, a red reading. Earth is 19 minutes away, and the flight surgeon's shift ended an hour ago. ASCLEPIUS says: *"Earth's earliest answer: 1 h 48 min. You must act within 30 min. Crew decides now; Earth will review."* The ground console receives the sealed message 19 minutes later and sees exactly what Asha saw.

---

## 4. Scope

**MUST** = the submission fails without it. **SHOULD** = build after all MUSTs are done. **STRETCH** = only if ahead of schedule. **WON'T** = do not start, even if someone has an idea at 3 a.m.

### 4.1 MUST

| ID | Item | Owner | Hours |
|---|---|---|---|
| M0 | Ship: commit rename, make repo public, CI deploys Pages, confirm demo opens logged-out on a phone | Story | 1 |
| M1 | Fix judge-visible bugs (Section 5.1) | Builder A | 3 |
| M2 | Clinical fixes and citations (Section 5.2) | Data + Builder A | 4 |
| M3 | **Earth Reply Clock** (Pillar A, Section 6.1) | Builder A | 8 |
| M4 | **Crew Pulse** (Pillar B, Section 6.2) | Builder B | 8 |
| M5 | **Proof screen** rebuilt on corrected data (Pillar C, Section 6.3) | Data + Builder B | 5 |
| M6 | 30 s video, project page text, human voice-over, subtitles (Section 8) | Story | 6 |

### 4.2 SHOULD

| ID | Item | Hours |
|---|---|---|
| S1 | **Ground Station console**, a static second page that receives sealed messages after the real delay (Section 7) | 6-8 |
| S2 | **"Delay is delay"** Earth mode: Telugu daily check plus the Reply Clock with travel time to the nearest doctor (Section 6.4) | 4 |
| S3 | Tamper demo that breaks the **signature**, not just the encryption; hash-chain the event log | 2 |

### 4.3 STRETCH (in this order)

1. **Post-landing stand test.** A guided 10-minute stand with heart rate and blood pressure at minutes 1, 3, 5 and 10, compared with the astronaut's own pre-flight test. 64% of Shuttle crew could not finish a 10-minute stand after flight. It reuses two of the six required readings and answers the "no low BP rule" gap with something space-specific. (3-4 h)
2. **SANS eye self-check.** A tappable Amsler grid and near-vision check against the astronaut's own baseline. NASA runs similar in-flight checks; zero competitors have one. Screens are not calibrated, so this is a "tell the CMO" trigger, never a measurement. (3 h)
3. **Rule validation on real daily vitals.** NASA's Life Sciences Data Portal reportedly holds UTMB bed-rest daily vitals (29 subjects, 2,939 days). Replay them through population-only, personal-only and "worse wins" rules and report false alarms per 100 person-days. **Unverified:** check access and terms on Nov 13 before planning it. (6 h)

### 4.4 WON'T (and why)

| Idea | Why not |
|---|---|
| DONKI / radiation card | 32 competitor repos already do it. The data research also found the API host unreliable. |
| LLM / chat assistant | 11 competitors; and our "every colour has a rule, no AI" stance is a deliberate contrast with the NASA-Google cloud assistant. |
| 3D body, Bluetooth sensors, camera OCR, voice input | Costly, unrelated to our pillars, common among competitors. |
| Cloud backend or database | Contradicts the offline thesis and adds a live-demo failure point. Our "backend" is the Ground Station (S1). |
| Hermes/Tauri desktop build in the demo | Reads as plumbing to judges; name clash. Stays in the repo. |
| Rebuilding the deck | We submit the video, not slides. Do not spend hours on both. |

---

## 5. Fixes to the existing app (M1, M2)

### 5.1 Judge-visible bugs (from the code audit, Nov 12)

| Problem | Where | Fix |
|---|---|---|
| Home shows "Your normal 0/7, learning" for an astronaut with 225 checks | `src/screens/Home.tsx:35` filters `INDICATORS`, which includes optional `crt` with no baseline | Use `CORE_INDICATORS`. Same fix removes the empty "Perfusion" tab in `Trends.tsx:61`. |
| `?video=check` submits the pre-filled values, not the typed ones, and ends without the Fatigue card | `src/screens/Check.tsx:76-85`, `finish()` captured once in an effect | Hold `finish` in a ref. Re-record the clip. |
| README quick start does not produce what it says: adaptive frequency hides BP, glucose and temperature | `projection.ts:110` | In demo/seeded mode, show all six as due; keep adaptive frequency for real use. Rewrite README steps. |
| Ladder text says "Tell the CMO: a pattern" while the fatigue pattern is set to `tellCmo:false` | `src/ui/body.tsx:184`, `rules.json:153` | Make the copy come from the rule, not a fixed string. |
| Daily digest row shows "Act now" | `src/app/record.ts:111` | Digest gets its own status. |
| 8 px sideways scroll at 390 px on every screen | `styles.css:121,147` (`.tag-sim` in `.band-right`) | Let the tag wrap or move below at narrow widths. |
| "Check done in 2 s" toast covers the Blood row | toast layout | Move toast to bottom safe area. |
| Blackout shown as Mar 8 - **Apr 4** 2028, docs say Apr 3 | `src/engine/horizons.ts:43-48` returns the first clear day | Return the last blocked day; dates outside the table must show "unknown", not clamp silently (`horizons.ts:13`). |

### 5.2 Clinical fixes (what a flight surgeon will ask)

| Gap | Fix | Source to cite |
|---|---|---|
| **No low blood pressure rule.** Systolic 65 shows green until the band is learned. Low BP on standing after landing is the classic astronaut BP problem. | Add a low clinical bound and a low red flag, plus a "dizzy when standing" symptom chip. | NASA-STD-3001 V1 Rev C, Table E.2-2 lists "gravity-transition orthostatic intolerance"; numbers from ACC/AHA, labelled as terrestrial. |
| Heart-rate "athlete clear" accepts anything ≥ 40 inside the band (docs say 50-59) | Floor at 50; test it. | `evaluate.ts:128` |
| Glucose 70-99 is a **fasting** range; a post-meal 120 shows yellow | "Fasting / after meal" chip; separate ranges. | ADA, labelled as terrestrial. |
| **Trends never escalate.** Three days of rising heart rate, low mood or short sleep only says "recheck" | Persistent trend (≥ 3 days) or repeated yellow (3 of 5 days) → tell CMO; sleep < 6 h for 3 nights → tell CMO and flag Earth digest. | V1 6001 (8.5 h sleep period), V1 4011 (behavioral health), V1 6010 (private psychological conference as escalation target). |
| Personal band freezes after 7 checks | Rolling window of the last 30 valid readings, as the code comment already promises. | `baseline.ts:46-51, 65-66` |
| 24 thresholds still marked `[VERIFY]` | Every threshold gets either a NASA-STD-3001 ID or a named terrestrial guideline. No `[VERIFY]` left in shipped files. | Table in Evidence E3. |

Every fix ships with a test. Target: ≥ 120 tests (91 today).

---

## 6. New features

### 6.1 Pillar A: Earth Reply Clock (M3)

**User story.** As an astronaut with a yellow or red result, I want to know whether Earth can help before I have to act, so I do not wait for an answer that will come too late.

**How it works.** For each finding:

```
earliest Earth reply = wait for next contact
                     + one-way light time       (JPL Horizons, real, by date)
                     + flight surgeon response   (depends on their shift, see below)
                     + one-way light time
act-by window        = from the rule that fired (team-defined, labelled)
```

Autonomy level, shown as a word, an icon and a sentence:

| Level | When | What the screen says |
|---|---|---|
| **Earth-guided** | earliest reply < half the act-by window | "Earth can answer in 46 min. Rest and recheck; the flight surgeon will reply." |
| **Earth-consulted** | earliest reply < act-by window | "Start the protocol now. Earth will confirm in 46 min." |
| **Crew decides** | earliest reply ≥ act-by window, or Sun blackout | "Earth's earliest answer: 1 h 48 min. You must act within 30 min. Your CMO decides now; Earth will review." |

**Inputs and where they come from.**

| Input | Source | Real or assumed |
|---|---|---|
| One-way light time on any date | JPL Horizons, already in `src/data/horizons_delay.json` (1,157 days) | Real NASA data |
| Sun blackout (conjunction) | Same file, Sun-angle column | Real NASA data |
| Is the flight surgeon on shift? | Mars sol is 24 h 39.6 min; the crew's day drifts ~40 min/day against Houston and lines up again about every 37 days. Compute with the NASA GISS Mars24 algorithm (extend `src/engine/mars.ts`). | Real algorithm; Houston shift hours are an assumption, shown in Settings |
| Next contact window | Mission setting, default "continuous" with an optional "8 h contact per sol" toggle | Assumption, labelled |
| Surgeon response time | 15 min on shift, 2 h off shift | Assumption, labelled |
| Act-by window per rule | Added to `rules.json` (`actWithinMin`); red flags = 0 | Team-defined, labelled |

**UI.** A small horizontal timeline on the Body screen and the Red Alert: *now* → *act by* → *Earth's answer*. If the answer lands after the act-by marker, the gap is red and the level reads "Crew decides". Home shows today's level for a typical yellow ("Today Earth can answer a yellow in 52 min").

**Why judges care.** It answers the challenge's own question ("When might a result warrant attention from the crew or from flight surgeons on the ground?") with a number computed from NASA data, not a fixed rule. It matches a gap NASA states in its own concept of operations. A NASA ops paper says crew autonomy is needed at delays of 5 minutes or more; our clock shows when.

**Acceptance.**
- Engine function `replyClock(finding, date, mission)` is pure and tested: conjunction → always "Crew decides"; Moon (1.3 s) → always "Earth-guided" for non-red; Mars at 4 and 22 min give different levels for the same finding.
- Every number on screen has a tap-to-see source ("Light time 19.2 min, JPL Horizons, 2028-01-14").

### 6.2 Pillar B: Crew Pulse (M4)

**User story.** As the CMO, I want to see whether a problem is one person, the cabin, or something spreading, so I treat the cause and not just the symptom.

**Rules (all deterministic, all shown with their reason):**

| Pattern | Rule | Message | Source |
|---|---|---|---|
| **One** | Only one crew member flagged | "Individual. Follow their check." | — |
| **Some/All, same day** | ≥ 2 crew log headache, poor sleep or fatigue on the same sol | "Same day, several crew: suspect the cabin. Check CO2." If cabin CO2 (entered or simulated) > 3 mmHg 1-h average → "Cabin CO2 above NASA limit." | NASA-STD-3001 V2 6004; OCHMO-TB-004 (headache 2.8-4.5 mmHg) |
| **Spreading** | Temperature or fever pattern in crew A, then crew B within 1-3 sols | "Possible infection spreading. Separate sleeping areas; tell Earth." | Viral reactivation (PMC6374706): 53% Shuttle / 61% ISS astronauts shed virus |
| **Sleep, all crew** | Crew-median sleep < 6 h for 3 sols | "Whole-crew sleep debt. Review the schedule with Earth." | V1 6001 (8.5 h sleep period) |

**Privacy.** The CMO sees each person's colour and pattern type, not their mood score or notes. Mood stays private unless the crew member shares it. Cite V1 6002 (private medical communication). This is a design choice judges notice.

**Data and demo.**
- Extend `src/seed/asha.ts` into a 4-person simulated crew (Asha Rao + 3 fictional), generated through the real engine, with one scripted CO2 day and one scripted fever spread. Label everything "Simulated crew data".
- In the habitat each crew member has a tablet; for the demo, one device has a **CMO view** that shows all four. Real two-tablet sync is out of scope (sealed QR packets are a STRETCH idea if S1 is done).
- New screen `Crew Pulse` (CMO view): four rows across 7 sols, one cell per sol, colour + icon + word; pattern banners above.

**Acceptance.** Tests for each pattern, including "two people flagged on different days is *not* same-day" and "fever in A then B after 4 sols is *not* spreading".

### 6.3 Pillar C: the proof, computed by the product (M5)

**Goal.** One number from named NASA data that a NASA judge can quote, produced by the same engine code the app uses.

**Steps.**
1. Copy the corrected CBC file (`research_notes/v3_evidence/cbc_fixed.csv`) into `hygiea/data/derived/`, with a short note explaining the C003 L-92 column shift and how it was fixed. Keep the original NASA file untouched next to it.
2. A small Node script runs the TypeScript engine's band logic on each crew member's 3 pre-flight draws and writes `src/data/i4_proof.json`. One command: `npm run proof`.
3. Port `research_notes/v3_evidence/ii.py` into `analysis/` for the index of individuality (within-person CV ÷ between-person CV). Fix its file paths.
4. Rebuild the Crew screen around two results:
   - **MCV:** a chart with each crew member's own band and the 80-100 fL population band. Day after landing: 4 of 4 below their own lowest pre-flight value (C001 90.1 vs 92.8; C002 90.5 vs 93.6; C003 88.7 vs 91.3; C004 87.0 vs 89.6), 4 of 4 inside the population range. Caption: *"Population range: 4 of 4 fine. Personal range: 4 of 4 changed."*
   - **Index of individuality:** 16 of 34 blood markers have II < 0.6, the textbook point below which population ranges miss personal change (hemoglobin 0.36, hematocrit 0.35, RBC 0.34, ALT 0.23).
5. Say the limits on the screen, not in a footnote: 4 people, 3 pre-flight draws, 3-day flight, no in-flight draws, post-flight only; MCV is still low at R+194 in 3 crew, so a lab or analyzer change may be part of it ("consistent with", not "proves"). Glucose R+45 values (36-44 mg/dL with high potassium) look like a sample-handling artefact and are excluded.
6. Remove the lymphocyte claim everywhere: `src/data/i4_summary.json`, `SUBMISSION.md`, README, deck sources, video captions.
7. Email the OSDR help desk about the shifted row before submitting and mention it on the project page. Finding and reporting an error in NASA's own data is a strong Validity signal.

**Before relying on the numbers:** re-run the MCV and II results from the raw file during the event and have a second team member check the C003 row fix by hand. The `(1/4)^4 ≈ 0.4%` figure assumes the four draws are exchangeable; present it only as "unlikely by chance", or leave it out.

### 6.4 "Delay is delay" Earth mode (S2)

- Settings → Mission → **Earth: rural clinic**. The Reply Clock's light time is replaced by travel time to the nearest doctor (default 3 h, editable) and the "flight surgeon on shift" input becomes clinic hours.
- The daily check screen appears in Telugu (strings in `docs/i18n/` are an AI draft; a native speaker on the team must review them before the event ends, and the page says who reviewed).
- One sentence on the project page: the same engine that tells an astronaut whether Earth can answer in time tells an ASHA worker near Warangal whether the PHC doctor can.
- No clinical claims for Earth use; this is a concept, labelled as such.

---

## 7. The "backend": Ground Station console (S1)

No cloud server. A second static page, `ground.html`, in the same Pages site.

- **Keys.** The ground station has its own key pair. The crew vault keeps only the ground **public** key. Today the ground private key sits in the astronaut's vault (`src/storage/crypto.ts:71-73`); that must end.
- **Transport.** In the demo, two browser tabs talk over `BroadcastChannel`. Fallback: copy-paste or file drop of the sealed packet. The console **holds each packet for the real light time** for its date (time-warp ×60 switch for the demo, clearly shown) and holds everything during a Sun blackout.
- **Triage queue.** Red first, then persistent yellow, then digests. Each packet opens a **decision snapshot**: exactly the readings, rules, bands and Reply Clock the crew saw, plus a hash of the rule set version. NASA's HERA delay studies found that with more crew autonomy, crew mood improved but the ground's shared understanding dropped; the snapshot is our answer to that.
- **Reply.** The surgeon writes advice, signs it, and it arrives at the crew one light time later. The Reply Clock on the crew side marks "Earth answered" with the real elapsed time.
- **Acceptance.** Tampering with the signed body after decryption is caught by the **signature** check (S3), shown on screen.

---

## 8. Presentation (M6)

### 8.1 The 30-second video (≤ 30.0 s, English subtitles, human voice)

| Time | Picture | Voice (draft) |
|---|---|---|
| 0-4 s | Mars, then "Earth: 19 min away" from Horizons | "On Mars, your doctor is nineteen minutes away. Each way." |
| 4-11 s | Daily check → yellow: personal band next to population band | "ASCLEPIUS checks every reading against your own normal, not just everyone's." |
| 11-17 s | Crew Pulse: 3 of 4 headache, "suspect the cabin, check CO2" | "It looks across the whole crew: one person, or the air you all breathe." |
| 17-25 s | Red alert, Reply Clock: Earth's answer lands after act-by → "Crew decides" | "And it knows when Earth's answer will come too late, so the crew can act now." |
| 25-30 s | Inspiration4 MCV chart, then name + tagline | "Proven on NASA crew data. ASCLEPIUS: medicine for when Earth is too far away." |

Rebuild from `video_build/` (`stage.html`, `render.mjs`) with new captures. Replace all HYGIEA text. A team member records the voice; synthetic voice only as a fallback, disclosed.

### 8.2 Project page summary (~140 words, the winning order: name → NASA data → twist → who benefits)

> ASCLEPIUS is an offline health self-check for astronauts that knows whether Earth can answer in time. Each day the astronaut logs six readings; each is judged against the usual adult range and against the astronaut's own learned normal, and every colour shows its rule and source. Using real Earth-Mars light times and Sun blackouts from NASA JPL Horizons and the NASA Mars24 sol clock, ASCLEPIUS compares when the crew must act with when a flight surgeon's answer can arrive, and tells the crew when to decide on their own. It looks across the whole crew to separate one sick person from bad cabin air (NASA-STD-3001 CO2 limits) or a spreading infection. Run on NASA OSDR Inspiration4 blood data (OSD-569), the same engine finds change in all four crew that population ranges call normal. On Earth, the same clock helps rural health workers near Warangal.

(Rewrite after the build with the real numbers.)

### 8.3 Q&A prep (one owner, practised twice)

| Likely question | Answer in one breath |
|---|---|
| "Isn't this just a personal-baseline app like Oura?" | The baseline is the base. What is new is the Reply Clock and crew-level reasoning, which no wearable does. |
| "Why not AI?" | A crew deciding alone must be able to see why. Every colour is a rule with a source. NASA and Google are testing a cloud AI assistant; ours works with no network. |
| "n = 4?" | Yes, and we say so on screen. The finding shows the method; it does not prove a clinical effect. |
| "Low blood pressure after landing?" | Rule added, plus the stand test (if built). |
| "What did you find in the NASA data?" | A shifted row in OSD-569 that changed the result. We fixed it, disclosed it, and reported it to OSDR. |

---

## 9. Plan by the hour

Roles assume 4 people using Claude Code. With fewer, merge Data into Builder B and Story into whoever is free. **Builder A** = engine and Reply Clock. **Builder B** = UI, Crew Pulse, Proof screen. **Data** = Inspiration4, citations, rules review. **Story** = shipping, video, page, Q&A, rules checks.

### Before the event (Nov 12-13): no product code

- [ ] Read the Nov 13 Submission and Judging guides; update Section 2 (Story)
- [ ] Read the challenge **Resources tab** (opens Nov 13); if a listed dataset fits a pillar, note it here (Data)
- [ ] Check NLSP bed-rest data access and terms (Data, decides STRETCH 3)
- [ ] All members registered for Warangal; team names agreed (Story)
- [ ] Choose who records the voice-over (Story)
- [ ] Hermes repo public, or decide to drop the desktop build from the submission (Builder A)
- [ ] Everyone reads this PRD

### Day 1: Saturday Nov 14

| Time | Builder A | Builder B | Data | Story |
|---|---|---|---|---|
| 09:00-10:00 | Commit rename (first event commit); repo public; Pages deploy (M0) | Seed 4-person crew | Re-check C003 fix and MCV/II by hand | Kick-off, rules update, storyboard |
| 10:00-13:00 | Bug fixes 5.1 (M1) | Crew Pulse rules + tests | Citation table; replace `[VERIFY]` | Project page draft |
| 13:00-14:00 | Lunch, 10-minute demo of what works | | | |
| 14:00-19:00 | Clinical fixes 5.2, then Reply Clock engine + tests | Crew Pulse screen | `npm run proof`, Proof screen data | Q&A sheet; OSDR email |
| 19:00-20:00 | Dinner | | | |
| 20:00-23:30 | Reply Clock UI | Proof screen UI | Review every rule message for plain English | Deploy and test on a real phone |
| 23:30 | **Checkpoint:** M0-M5 working in the live demo, or cut S1/S2 | | | |

### Day 2: Sunday Nov 15

| Time | Builder A | Builder B | Data | Story |
|---|---|---|---|---|
| 08:00-12:00 | Ground Station (S1) | Earth mode + Telugu (S2) | Native review of Telugu | Capture rough video takes |
| 12:00-15:00 | Signature tamper (S3); STRETCH if ahead | Polish: 390 px, contrast, reduced motion | Final numbers for the page | Record voice-over |
| **15:00** | **Code freeze.** Only fixes for bugs seen in the video after this. | | | |
| 15:00-19:00 | Fix what the video shows | Final captures | Check every claim against the evidence | Edit video, subtitles, upload |
| 19:00-21:00 | Everyone: run the full demo on a phone, logged out | | | Fill the submission form |
| **22:00** | **Submit.** 23:59 is the hard close, not the target. | | | |

---

## 10. Success measures

| Measure | Target |
|---|---|
| Live demo opens on a phone in a private window | Yes, checked by two people |
| A first-time user finishes a daily check | ≤ 60 s |
| Horizontal scroll at 390 px | 0 px |
| Tests | ≥ 120, all passing; CI green |
| `[VERIFY]` markers in shipped files | 0 |
| Every on-screen number traceable to a source | 100% (tap to see) |
| Headline finding reproducible | `npm run proof` regenerates it from the raw NASA file |
| Video length | ≤ 30.0 s, subtitled |
| Submitted | By 22:00 Nov 15 IST |

---

## 11. Risks

| Risk | Chance | Plan |
|---|---|---|
| Nov 13 guides change the demo format or rules | Medium | Section 2 is checked first thing on Day 1; the plan has slack. |
| Reply Clock looks like a gimmick | Low-medium | Every input is shown with its source; the EIMO citation and the "5 min" ops paper frame it as NASA's own open problem. |
| MCV finding challenged (lab change after flight) | Medium | Say it first, on screen. Keep the II result, which does not depend on post-flight draws. |
| Running out of time | High | MUSTs only until the 23:30 Day 1 checkpoint; S1/S2 cut first; deck never rebuilt. |
| Live demo breaks during judging | Low | Static site, no server; the video is the fallback. |

---

## 12. Evidence

All checked on 2026-11-12. Items marked *unverified* must be checked before use.

**E1. Competitors (GitHub search, ~190 repos since Aug 2026, 56 relevant READMEs)**
Feature counts: sleep 35, radiation 32, personal baseline 30, offline 27, crew overview 21, flight-surgeon view 20, OSDR/Inspiration4 20, cabin CO2 20, Earth delay 19, escalation 16, LLM 11, body map 10. Rare: SANS 7, autonomy 7, conjunction blackout 6, orthostatic 2. None found: Mars-sol health timing, cross-crew time-ordered reasoning, reply-time vs act-by comparison, NASA data with a corrected-row disclosure.
Closest: Horizon (`github.com/EishaTahir-code/astronaut-health-prac`), Crew Health Monitor (`github.com/AdityaK0804/Crew-Health-Monitor`), AURORA (`github.com/fabriciojunio/aurora-astronaut-health`), OrbitFit, CAELUM, VITA.

**E2. NASA and research sources**
- EIMO Concept of Operations, HRP Investigators' Workshop 2025: https://ntrs.nasa.gov/citations/20250000009
- Mission ops over time delay (autonomy at ≥ 5 min): https://www.nasa.gov/wp-content/uploads/2015/05/missionops_human_in_the_loop_over_time_delay_ops_lessons.pdf
- HERA communication-delay study: https://ntrs.nasa.gov/api/citations/20250003885/downloads/NASA%20TM20250003885.pdf
- CHP-IDSP / Chiron exploration health record: https://ntrs.nasa.gov/citations/20250004859
- NASA GISS Mars24 algorithm: https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
- OCHMO-TB-004 Carbon Dioxide: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf
- Herpes-virus reactivation in astronauts: https://pmc.ncbi.nlm.nih.gov/articles/PMC6374706
- Orthostatic intolerance after flight: https://www.frontiersin.org/articles/10.3389/fphys.2020.00784/pdf
- TRISH HERMES (name clash): https://bcm.edu/academic-centers/space-medicine/translational-research-institute/research/hermes
- NASA HRP Artemis II Data Methodology Challenge (small-n, many measures): https://hrpdatachallenge.org/
- *Unverified:* NLSP UTMB bed-rest daily vitals; reusable pipeline at https://github.com/ydtoloza/astronaut-health-dataset

**E3. NASA-STD-3001 citations for rules**
Vol 1 Rev C (2023-09-15), Vol 2 Rev F (2026-07-14), both downloaded and searched.

| Area | Citation |
|---|---|
| Monitoring mandate | V1 3003 §3.1.4, V1 3004 §3.1.5 |
| Sleep | V1 6001 §6.1 (8.5 h sleep period; avoid critical tasks 01:00-07:00 circadian low), V1 4014 §4.3.4 |
| Mood | V1 4011 §4.3.1, V1 6004 §6.3.1, V1 6010 §6.3.2.1 (private psychological conference), V1 6002 (private medical communication) |
| Blood | V1 4015-4017 §4.4 (population ranges and critical values) |
| BP / heart rate | No numbers in either volume. Table E.2-2 lists hypertension and gravity-transition orthostatic intolerance. Use ACC/AHA, labelled terrestrial. |
| Temperature | Appendix C (hypothermia < 35 °C); V2 6012 §6.2.3.1 |
| CO2 | V2 6004 §6.2.1.3 (≤ 3 mmHg, 1-hour average) |

**E4. Inspiration4 data (OSDR OSD-569 / OSD-575)**
- Raw: `hygiea/data/raw/LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv`
- Row shift in C003 L-92 confirmed by hand on Nov 12 (MCH empty; absolute lymphocytes 6826 = 71.1% × 9.6k, i.e. the neutrophil count).
- Corrected copy: `research_notes/v3_evidence/cbc_fixed.csv`; II script: `research_notes/v3_evidence/ii.py` (paths need updating).
- MCV values above confirmed against the raw file on Nov 12.

**E5. App audit screenshots**
`research_notes/v3_evidence/screenshots/` (Home "0/7" bug, after-check body map, broken `?video=check` ending, phone Home with sideways scroll).
