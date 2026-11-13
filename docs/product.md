# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary audience for the UI right now: NASA Space Apps Challenge 2026 judges.** They watch a 30-second video and try the public demo link, often on a phone or laptop, for a minute or two. The UI must read instantly and be memorable on camera while staying believable as crew software. (Confirmed: "judges first".)
- **The product's real user: an astronaut** on a long mission (Mars base by default; Moon and ISS settings exist), doing a one-minute daily health self-check on a tablet in the habitat, with no doctor on board and Earth 5-20 minutes away by radio.
- **Secondary:** the crew medical officer (alerted on red), and the flight surgeon on Earth (receives the signed, encrypted summary).

## Product Purpose
ASCLEPIUS turns six daily readings (blood pressure, resting heart rate, blood sugar, temperature, sleep, mood) into one clear answer, green, yellow or red, explains it in plain words on a body map, tells the astronaut what to do, and alerts the crew medical officer and Earth only when it is serious. Success: a judge understands "normal for everyone is not normal for you" within seconds, and a crew member finishes a check in about a minute.

## Positioning
Every reading is checked against the usual adult range **and** the astronaut's own learned baseline; the worse result wins. Every colour carries its rule, value, band and source (no AI). It is fully offline, and it knows the real Earth delay and Sun blackout from NASA JPL Horizons, so messages to Earth queue, are signed and encrypted, and show a true arrival time.

## Operating Context
- Offline PWA (installable) plus a Tauri desktop build that signs and encrypts Earth messages with the team's Hermes OpenPGP library.
- Demo flow judges follow: setup with a simulated crew member (Commander Asha Rao, Day 212, fictional) → daily check → body map with fatigue pattern and the Earth Reply Clock → Crew Pulse (cabin CO2, fever spread) → red alert ("crew decides") with Earth outbox → Ground Station console in a second tab → Sun blackout replay.
- Scripted video routes `?video=check|bodymap|proof|outbox` must keep working and look right on camera.
- Screens: Unlock, Home, Daily check, Body map + region drawer, Escalation ladder + Earth Reply Clock, Red alert, Trends, Earth outbox, Crew Pulse (CMO view), Proof (Inspiration4), Settings (incl. rural clinic mode, Telugu). Separate page: Ground Station console (`ground.html`).

## Capabilities and Constraints
- React 19 + Vite PWA; no server; all data encrypted on device. The engine, rules, storage and crypto are done and tested; the redesign must not change behaviour, copy facts, rules or data.
- Status is always colour + icon + word (never colour alone).
- Must work on phone (390 px), tablet and desktop with no horizontal scroll; ≥ 44 px targets; reduced motion respected; WCAG AA contrast.
- Light and dark appearance both required (confirmed), following the device setting.

## Brand Commitments
- Name **ASCLEPIUS**, tagline "Medicine for when Earth is too far away". Team ASCLEPIUS, Warangal, India.
- **NASA palette (binding, from the PRD and confirmed by the user):** space black `#000000`, white `#FFFFFF`, NASA blue `#0B3D91`, light blue `#6FA3FF`, NASA red `#FC3D21`; status green `#2EC27E`, yellow `#FFC72C`, red `#FC3D21`.
- **Type (binding, from the PRD):** Helvetica Neue / Helvetica / Arial. Large bold values, small caps labels.
- Motion 250-400 ms ease-out; nothing essential depends on animation.
- Avoid (confirmed): a generic SaaS dashboard look.
- Must not imitate the NASA insignia ("meatball") or "worm" logotype, or imply NASA endorsement.

## Evidence on Hand
- Real NASA data: JPL Horizons delays and blackout (`src/data/horizons_delay.json`), Inspiration4 blood data OSD-569/OSD-575 (`src/data/i4_summary.json`), NASA HRP hazards in guidance text.
- NASA public-domain images in `../deck_src/nasa_img/` (Blue Marble, Earthrise, Mars, ISS blood draw, astronaut Tim Peake panel).
- All crew data is simulated and must stay labelled "Simulated crew data". No testimonials, users or clinical validation exist; never imply them.

## Product Principles
1. One clear answer first, the reason one tap away.
2. Personal normal beats population normal, and the UI must show both bands side by side.
3. Act first, report after: Earth is minutes away, so the screen tells the crew what to do now.
4. Honest by construction: every colour traceable to a rule; simulated data always labelled; decision support, not diagnosis.

## Accessibility & Inclusion
WCAG AA contrast in both themes; status never by colour alone; ≥ 44 px targets; one-handed reach on tablet; `prefers-reduced-motion` honoured.
