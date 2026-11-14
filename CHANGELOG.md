# Changelog

All notable changes. Dates are 2026 (IST). The `pre-event` git tag marks the code that existed before NASA Space Apps 2026 (see [`docs/pre-event-disclosure.md`](docs/pre-event-disclosure.md)).

## [3.1.0] - 2026-11-14
### Added
- **Mission Story** screen: one week on Mars in six chapters, every number computed live; data-art spiral of daily Earth–Mars light time 2026–2029 (JPL Horizons).
- **Hindi** daily check (draft) beside Telugu; `CONTRIBUTING.md` with a 30-minute guide to add a language.
### Changed
- Header: compact menu below 1150 px; nav numbers hidden below 1520 px, so nine items never touch the Sim tag.

## [3.0.0] - 2026-11-13
Renamed HYGIEA → **ASCLEPIUS**. Built after the `pre-event` tag with the Local Lead's approval.

### Added
- **Earth Reply Clock**: compares when the crew must act with when Earth's answer can arrive (JPL Horizons light time, Sun blackout, flight-surgeon shift, Mars-sol drift) and sets the level: Earth guides / act, Earth confirms / crew decides.
- **Crew Pulse**: CMO view across the crew; separates one person, the cabin (CO2 vs NASA-STD-3001), a spreading fever, and whole-crew sleep debt. Mood is never shown.
- **Ground Station console** (`ground.html`): own keys; holds packets for the real light time; verifies signatures; rejects replays; signs replies.
- **Proof on NASA data**: `npm run proof` runs the app's band rule on OSDR OSD-569 (MCV, 4 of 4 crew) and the index of individuality (16 of 34 markers).
- **Rural clinic mode** ("delay is delay") and a Telugu daily check (draft).
- Clinical rules: low blood pressure, after-meal glucose, `PT-ORTHO` (dizzy on standing), persistent trends and 3-of-5 yellow days escalate to the CMO.
- Every guidance card links its NASA HRP hazard and risks (challenge Resources tab); CSA radiation article on the radiation hazard.
- Pitch deck, speech paper and their sources under `pitch/`.

### Changed
- Every threshold cites NASA-STD-3001 or a named terrestrial guideline; no `[VERIFY]` markers remain.
- Earth messages are encrypted to the ground station's **public** key; the crew vault no longer holds a ground private key (old vaults are migrated). Messages carry signed sequence numbers.
- A red check no longer doubles as the daily digest.

### Fixed
- Home "learning 0/7" for a fully learned astronaut; stale values in `?video=check`; ladder wording; blackout end date; 8 px sideways scroll at 390 px.

### Removed
- The "hidden lymphocyte drift in 4 of 4 crew" claim: it came from a column-shifted row (C003 L-92) in the OSD-569 file. The row is now corrected in `data/derived/` and the claim is withdrawn.

## [1.0.0] - 2026-11-04 (`pre-event`)
- Offline PWA: six-reading daily check, personal baselines, body map, escalation ladder, encrypted vault, Earth outbox with JPL Horizons delays and Sun blackout, trends and badges, camera capillary-refill check, Tauri desktop build.
