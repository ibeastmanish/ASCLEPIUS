# 30-second demo video

| File | What it is |
|---|---|
| [`ASCLEPIUS_30s_demo.mp4`](ASCLEPIUS_30s_demo.mp4) | The demo: 29.5 s, 1920×1080, 30 fps, English captions burned in, sound and a text-to-speech voice-over |
| [`ASCLEPIUS_30s_demo_no-voice.mp4`](ASCLEPIUS_30s_demo_no-voice.mp4) | Same video with sound only, for recording a human voice-over (e.g. in CapCut) |
| [`ASCLEPIUS_30s_demo.srt`](ASCLEPIUS_30s_demo.srt) | English subtitles |
| [`VOICEOVER_SCRIPT.txt`](VOICEOVER_SCRIPT.txt) | The voice-over lines with exact times |

**Watch:** https://youtu.be/lrWjnpbwsGk

**Scenes:** Mission Story (light-time spiral) → daily check → 90-day heart-rate graph vs the astronaut's own normal → red alert with the Earth Reply Clock → Ground Station opening the signed report → NASA Inspiration4 proof (4 of 4 crew changed) → end card.

**Rules (Space Apps 2026):** 30 seconds or less, English subtitles, public link with no login; submit the video **or** the deck, not both. The voice in `ASCLEPIUS_30s_demo.mp4` is macOS text-to-speech, so the submission says *"Voice-over generated with text-to-speech."* A human recording over the no-voice version needs no such note.

**Sound:** the ambient pad, transition whooshes, alert beeps and end chime are synthesised with ffmpeg in `build/build.py`; no third-party audio.

## Rebuild
Needs the app running locally (`npm run dev`, or set `BASE=` to the live site), Google Chrome and ffmpeg.
```bash
node pitch/video/build/capture.cjs      # records the scenes from the real app -> build/raw/
node pitch/video/build/cards.cjs        # captions and end card -> build/cards/
python3 -I pitch/video/build/build.py   # assembles the video, sound, voice, subtitles -> pitch/video/
```
Scene order, timings, captions and voice lines live in [`build/script.json`](build/script.json).
