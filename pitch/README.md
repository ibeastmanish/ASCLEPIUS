# Pitch materials

| File | What it is |
|---|---|
| [`ASCLEPIUS_SpaceApps2026_deck.pdf`](ASCLEPIUS_SpaceApps2026_deck.pdf) | The 7-slide deck, 1920×1080. Space Apps accepts a ≤7-slide deck **or** a ≤30 s video as the demo, not both. |
| [`ASCLEPIUS_SpaceApps2026_deck.pptx`](ASCLEPIUS_SpaceApps2026_deck.pptx) | The same slides for PowerPoint/Keynote, with the spoken script in the speaker notes. |
| [`ASCLEPIUS_SpaceApps2026_deck_school.pdf`](ASCLEPIUS_SpaceApps2026_deck_school.pdf) · [`.pptx`](ASCLEPIUS_SpaceApps2026_deck_school.pptx) | The same 7 slides in a science-fair, art-maximalist style: black notebook grid, marker titles, sticky notes, tape, stickers and doodles. Same facts and order, so either deck can be used. |
| [`ASCLEPIUS_Speech.pdf`](ASCLEPIUS_Speech.pdf) | The speech paper (A4, about 3 minutes), slide by slide, with a "technical, if asked" box under each slide. |
| [`script-and-qa.md`](script-and-qa.md) | Short script, the judge-table demo steps, and answers to likely questions. |
| [`source/`](source/) | `deck.html`, `speech_simple.html`, the NASA images (`img/`), the app screenshots (`shots/`) and the build scripts. |

## Rebuild
Requires Node 18+ and Google Chrome (set `CHROME_PATH` if Chrome is not in the default macOS location).
```bash
cd pitch/source
npm install
npm run build          # -> ../ASCLEPIUS_SpaceApps2026_deck.pdf, .pptx and ../ASCLEPIUS_Speech.pdf
npm run build:school   # -> the science-fair deck (needs internet once for its Google Fonts)
```
`build.cjs` also checks that no text runs off a slide and that every image loads, and writes `png/contact.png` (all 7 slides on one sheet) for a quick look.

Team member Tula Manish is named on slides 1 and 7 (the 2026 guide requires team member names on the slides).

## Credits
NASA public-domain images: Mars (NASA/JPL/USGS), Earthrise, Blue Marble, ISS blood draw (NASA). App screenshots show simulated crew data. No AI-generated imagery.
