"""Assemble the 30 s ASCLEPIUS demo: real app clips + captions, transitions, sound and voice-over.

  python3 -I pitch/video/build/build.py            (needs raw/*.webm from capture.cjs and cards/*.png from cards.cjs)

Sound is synthesised here with ffmpeg (ambient pad, transition whooshes, alert beeps, end chime),
so there are no third-party audio files. The voice-over uses a built-in macOS voice (`say`),
which is text-to-speech: disclose it, or replace it with your own voice in CapCut.

Outputs: ASCLEPIUS_30s_demo.mp4 (voice + sound), ASCLEPIUS_30s_demo_no-voice.mp4 (sound only),
ASCLEPIUS_30s_demo.srt, VOICEOVER_SCRIPT.txt
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)          # finished files go to pitch/video/
RAW, CARDS, TMP = (os.path.join(HERE, d) for d in ("raw", "cards", "tmp"))
os.makedirs(TMP, exist_ok=True)
script = json.load(open(os.path.join(HERE, "script.json")))
cuts = json.load(open(os.path.join(RAW, "cuts.json")))
T = 0.35                      # transition length (s)
VOICE = os.environ.get("VOICE", "Samantha")
LIMIT = 29.8                  # Space Apps: 30 s or less

def ff(args):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))

# ---- 1. video segments (clip + caption overlay)
segs = []
for i, s in enumerate(script):
    out = os.path.join(TMP, f"seg{i + 1}.mp4")
    if s.get("end"):
        ff(["-loop", "1", "-t", str(s["dur"]), "-i", os.path.join(CARDS, "end.png"),
            "-vf", "scale=1920:1080,fps=30,setsar=1,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-r", "30", out])
    else:
        start = s.get("start", cuts[s["clip"]]["start"] + s.get("offset", 0))
        ff(["-ss", f"{start:.2f}", "-t", str(s["dur"]), "-i", os.path.join(RAW, s["clip"] + ".webm"),
            "-i", os.path.join(CARDS, f"cap{i + 1}.png"),
            "-filter_complex", "[0:v]scale=1920:1080:flags=lanczos,fps=30,setsar=1[v];[v][1:v]overlay=0:0,format=yuv420p",
            "-an", "-c:v", "libx264", "-crf", "18", "-r", "30", out])
    segs.append(out)

# ---- 2. join with transitions (xfade chain); record when each scene becomes visible
inputs, chain, starts, acc = [], [], [0.0], script[0]["dur"]
for p in segs: inputs += ["-i", p]
last = "0:v"
for i in range(1, len(segs)):
    off = acc - T
    lab = f"x{i}"
    chain.append(f"[{last}][{i}:v]xfade=transition={script[i]['transition']}:duration={T}:offset={off:.3f}[{lab}]")
    starts.append(off)
    acc = off + script[i]["dur"]
    last = lab
total = acc
if total > LIMIT: sys.exit(f"too long: {total:.2f}s")
silent = os.path.join(TMP, "video.mp4")
ff([*inputs, "-filter_complex", ";".join(chain), "-map", f"[{last}]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", silent])

# ---- 3. voice-over lines (fit each into its scene)
voice = []
for i, s in enumerate(script):
    window = s["dur"] - T - 0.2 if i < len(script) - 1 else s["dur"] - 0.1
    rate = 175
    while True:
        aiff, wav = os.path.join(TMP, f"v{i + 1}.aiff"), os.path.join(TMP, f"v{i + 1}.wav")
        subprocess.run(["say", "-v", VOICE, "-r", str(rate), "-o", aiff, s["voice"]], check=True)
        ff(["-i", aiff, "-ar", "48000", "-ac", "2", wav])
        if dur(wav) <= window or rate >= 215: break
        rate += 8
    lead = 0.12 if i else 0.35
    at = starts[i] + lead
    if i == len(script) - 1:                      # last line must finish before the video ends
        at = min(at, total - dur(wav) - 0.15)
    if voice and at < voice[-1][1] + voice[-1][2] + 0.08:
        sys.exit(f"voice line {i + 1} overlaps the previous one")
    voice.append((wav, at, dur(wav)))

# ---- 4. sound design (synthesised)
pad = os.path.join(TMP, "pad.wav"); whoosh = os.path.join(TMP, "whoosh.wav"); beep = os.path.join(TMP, "beep.wav"); chime = os.path.join(TMP, "chime.wav")
ff(["-f", "lavfi", "-i", f"aevalsrc='(0.05*sin(2*PI*110*t)+0.035*sin(2*PI*164.8*t)+0.025*sin(2*PI*220*t)+0.015*sin(2*PI*329.6*t))*(0.8+0.2*sin(2*PI*0.25*t))':s=48000:d={total:.2f}",
    "-af", f"afade=t=in:d=1.5,afade=t=out:st={total - 1.8:.2f}:d=1.8,lowpass=f=1800", "-ac", "2", pad])
ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:duration=0.7:amplitude=0.6:sample_rate=48000",
    "-af", "highpass=f=400,lowpass=f=5000,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.4,volume=0.55", "-ac", "2", whoosh])
ff(["-f", "lavfi", "-i", "aevalsrc='if(lt(mod(t\\,0.26)\\,0.13)\\,0.35*sin(2*PI*880*t)\\,0)':s=48000:d=0.52",
    "-af", "afade=t=out:st=0.4:d=0.12", "-ac", "2", beep])
ff(["-f", "lavfi", "-i", "aevalsrc='0.3*(sin(2*PI*659.3*t)+0.6*sin(2*PI*987.8*t)+0.3*sin(2*PI*1318.5*t))*exp(-2.5*t)':s=48000:d=2.0",
    "-ac", "2", chime])
sfx = [(whoosh, max(0, starts[i] - 0.2)) for i in range(1, len(script))]
for i, s in enumerate(script):
    if s.get("sfx") == "alert": sfx.append((beep, starts[i] + T))
    if s.get("sfx") == "chime": sfx.append((chime, starts[i] + T * 0.5))

def mix(with_voice, out):
    items = [(pad, 0.0)] + sfx + ([(w, at) for w, at, _ in voice] if with_voice else [])
    args, parts = ["-i", silent], []
    for k, (f, at) in enumerate(items):
        args += ["-i", f]
        ms = int(at * 1000)
        parts.append(f"[{k + 1}:a]adelay={ms}|{ms},apad[a{k}]")
    labels = "".join(f"[a{k}]" for k in range(len(items)))
    parts.append(f"{labels}amix=inputs={len(items)}:normalize=0:duration=first,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
    ff([*args, "-filter_complex", ";".join(parts), "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-ar", "48000", "-t", f"{total:.3f}", "-movflags", "+faststart", out])

mix(True, os.path.join(OUT, "ASCLEPIUS_30s_demo.mp4"))
mix(False, os.path.join(OUT, "ASCLEPIUS_30s_demo_no-voice.mp4"))

# ---- 5. subtitles + script
def ts(t): return f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{t % 60:06.3f}".replace(".", ",")
srt, txt = [], ["ASCLEPIUS 30-second demo: voice-over script (times match the video)", ""]
for i, s in enumerate(script):
    a = starts[i] + (T if i else 0)
    b = (starts[i + 1] if i + 1 < len(script) else total) - 0.05
    srt += [str(i + 1), f"{ts(a)} --> {ts(b)}", s["caption"], ""]
    txt.append(f"{a:5.1f}s - {b:5.1f}s   {s['voice']}")
open(os.path.join(OUT, "ASCLEPIUS_30s_demo.srt"), "w").write("\n".join(srt))
txt += ["", f"The voice in ASCLEPIUS_30s_demo.mp4 is macOS text-to-speech ({VOICE}). If you keep it, add to the submission:",
        "\"Voice-over generated with text-to-speech.\"  To use your own voice, record over ASCLEPIUS_30s_demo_no-voice.mp4 in CapCut."]
open(os.path.join(OUT, "VOICEOVER_SCRIPT.txt"), "w").write("\n".join(txt) + "\n")
print(f"total {total:.2f}s; voice lines:", ", ".join(f"{d:.1f}s" for _, _, d in voice))
