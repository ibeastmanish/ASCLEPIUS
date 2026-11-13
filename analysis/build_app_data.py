#!/usr/bin/env python3
"""
ASCLEPIUS - turn the cached JPL Horizons download into the small file the app
reads offline: src/data/horizons_delay.json.

    python3 analysis/build_app_data.py

Output format (compact, one entry per day):
    {"source": ..., "start": "2026-11-01", "days": [[oneWayMin, sunAngleDeg], ...]}
Day i is start + i days. Deterministic: same input -> identical bytes.
"""
import datetime as dt
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "horizons_earth_mars.json")
OUT = os.path.join(ROOT, "src", "data", "horizons_delay.json")


def main():
    with open(SRC) as f:
        h = json.load(f)
    rows = h["rows"]
    dates = [dt.datetime.strptime(r["date"], "%Y-%b-%d %H:%M").date() for r in rows]
    start = dates[0]
    for i, d in enumerate(dates):
        assert d == start + dt.timedelta(days=i), f"gap in Horizons rows at {d}"
    days = [[round(r["one_way_light_time_s"] / 60, 2), round(r["sun_earth_target_elongation_deg"], 2)]
            for r in rows]
    out = {
        "source": "NASA JPL Horizons API, target Mars (499), observer Earth geocenter (500@399), "
                  "quantities 20 (range) and 23 (Sun-Earth-Mars angle), daily",
        "start": start.isoformat(),
        "blackoutBelowDeg": 3.0,
        "days": days,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")

    # Print the checked facts so a human can compare with the PRD.
    mins = [d[0] for d in days]
    exact = [r["one_way_light_time_s"] for r in rows]  # unrounded, so ties don't hide the true extreme
    lo, hi = exact.index(min(exact)), exact.index(max(exact))
    nov14 = (dt.date(2026, 11, 14) - start).days
    black = [start + dt.timedelta(days=i) for i, d in enumerate(days) if d[1] < 3.0]
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(days)} days from {start}")
    print(f"  2026-11-14 one way: {mins[nov14]:.1f} min")
    print(f"  minimum {min(mins):.1f} min on {start + dt.timedelta(days=lo)}")
    print(f"  maximum {max(mins):.1f} min on {start + dt.timedelta(days=hi)}")
    if black:
        print(f"  Sun < 3 deg: {black[0]} .. {black[-1]} ({len(black)} days)")


if __name__ == "__main__":
    main()
