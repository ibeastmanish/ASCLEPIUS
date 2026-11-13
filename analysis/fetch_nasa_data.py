#!/usr/bin/env python3
"""
ASCLEPIUS - download every NASA source the app uses into data/raw/ and record
provenance (URL, fetch time, size, SHA-256) in data/manifest.json.

Usage:
    python3 analysis/fetch_nasa_data.py                 # all sources
    python3 analysis/fetch_nasa_data.py horizons osdr   # selected sources
    NASA_API_KEY=xxxx python3 analysis/fetch_nasa_data.py donki

Standard library + system `curl` only. The app never calls these APIs at
runtime: it ships the cached, processed files (see build_app_data.py).
"""
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
MANIFEST = os.path.join(ROOT, "data", "manifest.json")
UA = "ASCLEPIUS-SpaceApps2026/1.0 (+https://www.spaceappschallenge.org)"
AU_KM = 149_597_870.7
C_KM_S = 299_792.458

os.makedirs(RAW, exist_ok=True)


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def curl(url, out_path=None, timeout=90, retries=3):
    cmd = ["curl", "-sSL", "--fail", "-m", str(timeout), "-A", UA]
    if out_path:
        cmd += ["-o", out_path]
    cmd.append(url)
    last = None
    for attempt in range(1, retries + 1):
        p = subprocess.run(cmd, capture_output=True)
        if p.returncode == 0:
            return None if out_path else p.stdout
        last = p.stderr.decode(errors="replace").strip()
        time.sleep(2 * attempt)
    raise RuntimeError(f"curl failed for {url}: {last}")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as f:
            return json.load(f)
    return {"project": "ASCLEPIUS", "event": "NASA Space Apps Challenge 2026", "files": {}}


def record(m, path, source, url, note):
    rel = os.path.relpath(path, os.path.join(ROOT, "data"))
    m["files"][rel] = {"source": source, "url": url, "fetched_utc": now_iso(),
                       "bytes": os.path.getsize(path), "sha256": sha256(path), "note": note}


def write_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=1)


# ----------------------------------------------------------- JPL Horizons
def fetch_horizons(m):
    q = ("https://ssd.jpl.nasa.gov/api/horizons.api?format=json"
         "&COMMAND='499'&EPHEM_TYPE=OBSERVER&CENTER='500@399'"
         "&START_TIME='2026-11-01'&STOP_TIME='2029-12-31'&STEP_SIZE='1 d'"
         "&QUANTITIES='20,23'&CSV_FORMAT=YES")
    res = json.loads(curl(q.replace(" ", "%20")))["result"]
    body = res[res.index("$$SOE") + 5: res.index("$$EOE")].strip().splitlines()
    rows = []
    for line in body:
        parts = [p.strip() for p in line.split(",")]
        nums = [p for p in parts[1:] if p not in ("", "*", "C", "m", "N", "A")]
        try:
            delta_au = float(nums[0])
            elong = float(nums[2])
        except (ValueError, IndexError):
            continue
        rows.append({"date": parts[0], "range_au": delta_au,
                     "one_way_light_time_s": round(delta_au * AU_KM / C_KM_S, 2),
                     "sun_earth_target_elongation_deg": elong})
    out = os.path.join(RAW, "horizons_earth_mars.json")
    write_json(out, {"target": "Mars (499)", "observer": "Earth geocenter (500@399)", "rows": rows,
                     "solar_conjunction_days_elongation_lt_3deg":
                         [r["date"] for r in rows if r["sun_earth_target_elongation_deg"] < 3.0],
                     "note": "One-way light time = range / c. Elongation < 3 deg is a "
                             "project-defined proxy for the solar-conjunction blackout."})
    record(m, out, "NASA JPL Horizons API", q, "Daily Earth-Mars range, light time, Sun-Earth-Mars angle")
    print(f"  Horizons: {len(rows)} days")


# ----------------------------------------------------------- NASA OSDR
OSDR_FILES = {
    "OSD-569": ["LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv"],
    "OSD-575": ["LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv"],
}


def fetch_osdr(m):
    for osd, files in OSDR_FILES.items():
        meta_url = f"https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/{osd}/"
        meta_path = os.path.join(RAW, f"osdr_{osd}_metadata.json")
        curl(meta_url, meta_path)
        record(m, meta_path, "NASA OSDR", meta_url, f"{osd} study metadata")
        for fn in files:
            url = f"https://osdr.nasa.gov/geode-py/ws/studies/{osd}/download?source=datamanager&file={fn}"
            path = os.path.join(RAW, fn)
            curl(url, path)
            record(m, path, "NASA OSDR", url, f"{osd} SpaceX Inspiration4 {fn.split('_', 1)[1]}")
            print(f"  OSDR {osd}: {fn}")


# ----------------------------------------------------------- DONKI
def fetch_donki(m):
    key = os.environ.get("NASA_API_KEY", "DEMO_KEY")
    start, end = "2024-01-01", "2025-12-31"
    urls = [f"https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/SEP?startDate={start}&endDate={end}",
            f"https://api.nasa.gov/DONKI/SEP?startDate={start}&endDate={end}&api_key={key}"]
    for url in urls:
        try:
            p = os.path.join(RAW, f"donki_sep_{start}_{end}.json")
            curl(url, p, timeout=60, retries=2)
            n = len(json.load(open(p)))
            record(m, p, "NASA DONKI (CCMC)", url.split("api_key")[0], f"SEP events {start}..{end}")
            print(f"  DONKI: {n} SEP events")
            return
        except Exception as e:  # noqa: BLE001 - try the next mirror
            print(f"  DONKI via {url.split('/')[2]} failed: {str(e)[:80]}")
    print("  DONKI unavailable - rerun later (set NASA_API_KEY from api.nasa.gov).")


SOURCES = {"horizons": fetch_horizons, "osdr": fetch_osdr, "donki": fetch_donki}


def main():
    chosen = sys.argv[1:] or list(SOURCES)
    m = load_manifest()
    for name in chosen:
        print(f"[{name}]")
        try:
            SOURCES[name](m)
        except Exception as e:  # noqa: BLE001 - keep going, cached copies stay in the repo
            print(f"  FAILED: {e}")
        write_json(MANIFEST, m)


if __name__ == "__main__":
    main()
