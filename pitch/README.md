# Pitch materials

Everything for presenting ASCLEPIUS. Space Apps accepts **one** demo: a video of 30 seconds or less **or** a deck of up to 7 slides (not both).

## Demo (choose one)
| File | What it is |
|---|---|
| [`ASCLEPIUS_SpaceApps2026_deck.pdf`](ASCLEPIUS_SpaceApps2026_deck.pdf) · [`.pptx`](ASCLEPIUS_SpaceApps2026_deck.pptx) | **Main deck**, 7 slides (1920×1080), black NASA style. The PPTX has the spoken script in its speaker notes. |
| [`ASCLEPIUS_SpaceApps2026_deck_school.pdf`](ASCLEPIUS_SpaceApps2026_deck_school.pdf) · [`.pptx`](ASCLEPIUS_SpaceApps2026_deck_school.pptx) | The same 7 slides in an art-maximalist notebook style. Same facts and order. |
| [`video/ASCLEPIUS_30s_demo.mp4`](video/ASCLEPIUS_30s_demo.mp4) · [YouTube](https://youtu.be/lrWjnpbwsGk) | **30-second video** (29.5 s, 1080p): real app footage, transitions, sound, English captions, text-to-speech voice-over. See [`video/`](video/). |

## Presenting
| File | What it is |
|---|---|
| [`ASCLEPIUS_Speech.pdf`](ASCLEPIUS_Speech.pdf) | Speech paper, slide by slide, with a "technical, if asked" box under each slide. |
| [`script-and-qa.md`](script-and-qa.md) | Short script, the judge-table demo steps, and answers to likely questions. |

## Images
[`banners/`](banners/): project banners built from NASA public-domain images (no AI imagery).

| File | Use |
|---|---|
| `ASCLEPIUS_banner.png` | Wide (8:3): README, social headers |
| `ASCLEPIUS_banner_3x2.png` | 3:2: the Space Apps team card |
| `ASCLEPIUS_banner_4x3.png` | 4:3: clean |
| `ASCLEPIUS_banner_4x3_maximal.png` | 4:3: art-maximalist collage |
| `ASCLEPIUS_banner_4x3_teampage.png` | 4:3, centred: the Space Apps team page (it crops and blurs the edges) |

## Rebuild
Requires Node 18+ and Google Chrome (set `CHROME_PATH` if Chrome is not in the default macOS location).
```bash
cd pitch/source && npm install
npm run build          # main deck (PDF + PPTX) and the speech paper
npm run build:school   # notebook deck (needs internet once for its Google Fonts)
```
The video rebuilds from [`video/build/`](video/build/); see [`video/README.md`](video/README.md).

`source/` holds `deck.html`, `deck_school.html`, `speech_simple.html`, the banner pages, NASA images (`img/`), app screenshots (`shots/`) and the build scripts. The build checks that no text runs off a slide and that every image loads.

## Credits
NASA public-domain images: Mars (NASA/JPL/USGS, PIA00407), Blue Marble (AS17-148-22727), Earthrise (Apollo 8), ISS blood draw (NASA). App screenshots show simulated crew data.
