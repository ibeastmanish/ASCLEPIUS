"""Assemble the 30 s ASCLEPIUS demo from raw/*.webm + cards/*.png with the system ffmpeg.

Outputs (in this folder):
  ASCLEPIUS_30s_demo.mp4   video with burned-in English captions and a silent audio track (add a voice in CapCut)
  ASCLEPIUS_30s_demo.srt   the same captions as a subtitle file
  VOICEOVER_SCRIPT.txt     the lines to read or paste into CapCut text-to-speech, with exact times
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RAW, CARDS = os.path.join(HERE, "raw"), os.path.join(HERE, "cards")
script = json.load(open(os.path.join(HERE, "script.json")))
cuts = json.load(open(os.path.join(RAW, "cuts.json")))
tmp = os.path.join(HERE, "tmp")
os.makedirs(tmp, exist_ok=True)

def run(args):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr)

segs = []
for i, s in enumerate(script):
    out = os.path.join(tmp, f"seg{i + 1}.mp4")
    vf = "scale=1920:1080:flags=lanczos,fps=30,setsar=1,format=yuv420p"
    if s.get("end"):
        run(["-loop", "1", "-t", str(s["dur"]), "-i", os.path.join(CARDS, "end.png"),
             "-vf", f"{vf},fade=t=in:st=0:d=0.4", "-c:v", "libx264", "-crf", "18", "-r", "30", out])
    else:
        start = cuts[s["clip"]]["start"]
        fade = ",fade=t=in:st=0:d=0.35" if i == 0 else ""
        run(["-ss", f"{start:.2f}", "-t", str(s["dur"]), "-i", os.path.join(RAW, s["clip"] + ".webm"),
             "-i", os.path.join(CARDS, f"cap{i + 1}.png"),
             "-filter_complex", f"[0:v]scale=1920:1080:flags=lanczos,fps=30,setsar=1{fade}[v];[v][1:v]overlay=0:0,format=yuv420p",
             "-an", "-c:v", "libx264", "-crf", "18", "-r", "30", out])
    segs.append(out)

lst = os.path.join(tmp, "list.txt")
open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
final = os.path.join(HERE, "ASCLEPIUS_30s_demo.mp4")
run(["-f", "concat", "-safe", "0", "-i", lst, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
     "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", final])

def ts(t):
    h, m = int(t // 3600), int(t % 3600 // 60)
    return f"{h:02d}:{m:02d}:{t % 60:06.3f}".replace(".", ",")

t, srt, txt = 0.0, [], ["ASCLEPIUS 30-second demo: voice-over script", "Read each line in its time window (or paste into CapCut text-to-speech).", ""]
for i, s in enumerate(script):
    srt += [str(i + 1), f"{ts(t + 0.1)} --> {ts(t + s['dur'] - 0.1)}", s["caption"], ""]
    txt.append(f"{int(t):02d}s – {int(t + s['dur']):02d}s   {s['voice']}")
    t += s["dur"]
open(os.path.join(HERE, "ASCLEPIUS_30s_demo.srt"), "w").write("\n".join(srt))
txt += ["", "If you use AI text-to-speech, add to the submission: \"Voice-over generated with text-to-speech.\""]
open(os.path.join(HERE, "VOICEOVER_SCRIPT.txt"), "w").write("\n".join(txt) + "\n")
print("total seconds:", t)
