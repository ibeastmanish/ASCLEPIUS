#!/usr/bin/env python3
"""
HYGIEA proof analysis: "normal for everyone is not normal for you".

Real data: NASA OSDR OSD-569 (CBC) and OSD-575 (CMP), SpaceX Inspiration4,
4 civilian crew, 3-day flight, 7 timepoints each.

For each crew member and marker:
  personal baseline = median of the three pre-flight draws (L-92, L-44, L-3)
  % change vs. that baseline at R+1, R+45, R+82, R+194
  whether each value sits inside the lab's clinical reference range

Then count "hidden drifts": values that are inside the clinical range yet
move more than 20% from the person's own baseline (project-defined cut-off).

    python3 analysis/inspiration4_baseline.py      -> src/data/i4_summary.json

Standard library only; deterministic (sorted keys, fixed rounding).
"""
import csv
import json
import os
import statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "src", "data", "i4_summary.json")

PRE = ["L-92", "L-44", "L-3"]
POST = ["R+1", "R+45", "R+82", "R+194"]
DRIFT_PCT = 20.0

# The app's own personal-band rule (src/engine/rules.json): median +/- k x scaled MAD.
with open(os.path.join(ROOT, "src", "engine", "rules.json"), encoding="utf-8") as _f:
    _B = json.load(_f)["baseline"]
MAD_SCALE, K, LEARNING_CHECKS = _B["madScale"], _B["k"], _B["learningChecks"]

MARKERS = [
    # (study, file, column prefix, display name, unit)
    ("OSD-569", "LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv",
     "absolute_lymphocytes", "Lymphocytes", "cells/µL"),
    ("OSD-569", "LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv",
     "absolute_neutrophils", "Neutrophils", "cells/µL"),
    ("OSD-569", "LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv",
     "white_blood_cell_count", "White blood cells", "thousand/µL"),
    ("OSD-575", "LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv",
     "glucose", "Glucose", "mg/dL"),
]


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def load(fn):
    with open(os.path.join(RAW, fn), encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def col(header, prefix, kind):
    """Find e.g. glucose_value_..., glucose_range_min_..., glucose_range_max_..."""
    for h in header:
        if h.startswith(f"{prefix}_{kind}"):
            return h
    raise KeyError(f"{prefix}_{kind}")


def parse_sample(name):
    parts = name.split("_")
    crew = parts[0]
    tp = next(p for p in parts if p.startswith(("L-", "R+")))
    return crew, tp


def pct(v, base):
    return round(100.0 * (v - base) / base, 1)


def main():
    markers_out = []
    for study, fn, prefix, label, unit in MARKERS:
        rows = load(fn)
        header = list(rows[0].keys())
        vcol, lcol, hcol = col(header, prefix, "value"), col(header, prefix, "range_min"), col(header, prefix, "range_max")
        by_crew = {}
        for r in rows:
            crew, tp = parse_sample(r["Sample Name"])
            by_crew.setdefault(crew, {})[tp] = (num(r[vcol]), num(r[lcol]), num(r[hcol]))
        crew_out = []
        for crew in sorted(by_crew):
            tps = by_crew[crew]
            pre = [tps[t][0] for t in PRE if t in tps and tps[t][0] is not None]
            if len(pre) < 2:
                continue
            base = statistics.median(pre)
            half = K * MAD_SCALE * statistics.median([abs(v - base) for v in pre])
            points = []
            for t in PRE + POST:
                if t not in tps or tps[t][0] is None:
                    continue
                v, lo, hi = tps[t]
                inside = (lo is None or v >= lo) and (hi is None or v <= hi)
                change = pct(v, base)
                points.append({
                    "timepoint": t, "value": v, "refLow": lo, "refHigh": hi,
                    "insideClinical": inside, "pctVsBaseline": change,
                    "hiddenDrift": t in POST and inside and abs(change) > DRIFT_PCT,
                    "outsideAppBand": t in POST and abs(v - base) > half,
                })
            crew_out.append({"crew": crew, "baseline": round(base, 2), "points": points})
        r1 = [next(p for p in c["points"] if p["timepoint"] == "R+1") for c in crew_out
              if any(p["timepoint"] == "R+1" for p in c["points"])]
        markers_out.append({
            "study": study, "file": fn, "marker": prefix, "label": label, "unit": unit,
            "crew": crew_out,
            "r1": {
                "n": len(r1),
                "insideClinical": sum(p["insideClinical"] for p in r1),
                "hiddenDrift": sum(p["hiddenDrift"] for p in r1),
                "outsideAppBand": sum(p["outsideAppBand"] for p in r1),
            },
        })

    summary = {
        "title": "Inspiration4: clinically normal, personally changed",
        "sources": [
            {"id": "OSD-569", "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-569", "what": "Complete blood count"},
            {"id": "OSD-575", "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575", "what": "Comprehensive metabolic panel"},
        ],
        "method": (f"Personal baseline = median of {', '.join(PRE)}. Change = % vs. that baseline. "
                   f"Hidden drift = inside the lab reference range but more than {DRIFT_PCT:.0f}% "
                   "from the person's own baseline (project-defined cut-off)."),
        "caveat": ("4 civilian crew, 3-day low-Earth-orbit flight, blood drawn after landing. "
                   "Small sample: this illustrates the idea of personal baselines; it is not "
                   "clinical evidence and not a prediction for Mars missions."),
        "driftPct": DRIFT_PCT,
        "appBand": {
            "k": K, "madScale": MAD_SCALE, "learningChecks": LEARNING_CHECKS, "preflightDraws": len(PRE),
            "note": (f"HYGIEA's own band rule (median +/- {K} x scaled MAD) needs {LEARNING_CHECKS} checks. "
                     f"Inspiration4 has only {len(PRE)} pre-flight draws, so a band built from them is too wide "
                     "and noisy to trust; the fixed 20% cut-off is used here instead. 'Outside app band' shows "
                     "what the app's rule would say with those 3 draws."),
        },
        "markers": markers_out,
    }
    with open(OUT, "w") as f:
        json.dump(summary, f, indent=1, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    print(f"wrote {os.path.relpath(OUT, ROOT)}")
    for m in markers_out:
        r1s = [(c["crew"], next((p for p in c["points"] if p["timepoint"] == "R+1"), None)) for c in m["crew"]]
        desc = ", ".join(f"{crew} {p['pctVsBaseline']:+.1f}%{'' if p['insideClinical'] else ' (out of range)'}"
                         for crew, p in r1s if p)
        print(f"  {m['label']:<18} R+1: {desc}  | hidden drift {m['r1']['hiddenDrift']}/{m['r1']['n']}"
              f" | outside app band {m['r1']['outsideAppBand']}/{m['r1']['n']}")


if __name__ == "__main__":
    main()
