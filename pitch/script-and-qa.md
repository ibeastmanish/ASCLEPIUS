# ASCLEPIUS: pitch script (about 3 minutes) and judge-table demo

Files: `pitch/ASCLEPIUS_SpaceApps2026_deck.pdf` (7 slides, 1920×1080) and `.pptx` (same slides, script in the speaker notes).
Rebuild after editing `source/deck.html` or `source/speech_simple.html`: `cd pitch/source && npm install && npm run build` (see `pitch/README.md`).
Space Apps accepts **one** demo format: a ≤30 s video **or** ≤7 slides. This deck is ready as the slide option and for the local pitch.
Presenter: Tula Manish (named on slides 1 and 7, as the 2026 guide requires).

## Script
1. **Cover (15 s).** So basically, my project is about helping astronauts take care of their health when their doctor is millions of kilometres away. I'm Tula Manish from Warangal, and it's called ASCLEPIUS. ASCLEPIUS is an offline health check for astronauts that knows whether Earth can answer in time, and tells the crew what to do when it cannot.
2. **Problem (25 s).** Mars is 4 to 22 minutes away by radio, each way: 11 minutes on 14 November 2026, from NASA JPL Horizons. In 2028 the Sun cuts the link for 27 days. And normal is personal: a heart rate of 74 is fine for most people, but a warning for someone whose own normal is 52 to 62.
3. **How it works (25 s).** One minute, the six readings from the challenge. Each one is checked against the usual adult range and against your own learned normal; the worse result wins. Every colour on the body map shows its rule and source. No AI makes health decisions.
4. **Earth Reply Clock (30 s).** New: for every finding we compare when you must act with when Earth can answer. For a red result on Mars, Earth needs 27 minutes even with the surgeon on shift. You have 10. The crew decides. NASA's own concept for Earth-independent medicine has no levels for this; we give it numbers.
5. **Crew Pulse (25 s).** The medical officer sees the whole crew. Three of four with headaches on the same day and cabin CO2 above NASA's limit: it is the air, not the people. A fever moving from Kwame to Mei two days apart: possible infection. Mood stays private.
6. **Proof (30 s).** We ran our own rule on NASA's Inspiration4 blood data. The day after landing, all four crew had smaller red blood cells than their own lowest pre-flight value, while all four looked normal on the population range. I also found and fixed a shifted row in the NASA file, and reported it to NASA. Four people and a 3-day flight: consistent with our idea, not proof.
7. **Impact (20 s).** The same clock works near Warangal, where the doctor can be hours away. Open source, 162 automated tests, and the live demo runs on any phone. Thank you.

## Judge-table demo (phone in hand, about 2 minutes)
Live demo → passphrase → keep "simulated crew member" → **Check** (HR 74, sleep 5.2, mood 3) → **Body map** (fatigue card, tell the CMO, Reply Clock) → **Crew Pulse** (cabin CO2, fever spread) → new check with blood sugar 48 → **Act now** (Reply Clock: crew decides) → **Outbox** → second tab **ground.html**, ×60 time warp → packet arrives, signature valid → write a reply → back on the crew tab: "Earth answered". Optional: **Replay test** (rejected), Settings → Mar 20 2028 (blackout).

## Likely questions
| Question | Answer |
|---|---|
| Isn't this a personal-baseline app like a smartwatch? | The baseline is the base. The new parts are the Reply Clock (who decides, from the real delay) and Crew Pulse (one person vs the cabin vs infection). |
| Why no AI? | A crew deciding alone must see why. Every colour is a rule with a source, and it works with no network. |
| n = 4? | Yes, and it says so on screen. It shows the method, not a clinical effect. |
| Low blood pressure after landing? | Yellow under 90/60, red under 80/40, and a "dizzy when standing" pattern (NASA-STD-3001 lists orthostatic intolerance). |
| Where do the thresholds come from? | NASA-STD-3001 where it sets a limit (sleep, CO2, hypothermia); named terrestrial guidelines (ACC/AHA, ADA) where it does not, labelled so. |

Image credits: Mars NASA/JPL/USGS; Earthrise, Blue Marble, ISS blood draw: NASA. All crew data shown is simulated.
