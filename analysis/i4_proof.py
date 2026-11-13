#!/usr/bin/env python3
"""
ASCLEPIUS Pillar C: the proof, computed from named NASA data.

    python3 -I analysis/i4_proof.py
        reads   data/raw/LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv   (OSDR OSD-569)
                data/raw/LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv (OSDR OSD-575)
        writes  data/derived/cbc_corrected.csv   (raw file with one documented row fix)
                src/data/i4_proof.json           (everything the Crew screen shows)

Then `node scripts/proof.mjs` runs the app's own TypeScript band function
(src/engine/baseline.ts) on the same corrected file and adds the "engine"
section to i4_proof.json. `npm run proof` runs both.

Standard library only. Deterministic: same input -> identical bytes.
The raw NASA files are never modified.

1. The C003 L-92 row fix
   In the raw CBC file, row C003_whole-blood_L-92_cbc has an empty MCH value and
   ten values that each sit one place late in the lab report's own order
       MCH, MCHC, RDW, platelets, MPV, abs. neutrophils, abs. lymphocytes,
       abs. monocytes, abs. eosinophils, abs. basophils
   (MCH is blank, MCHC holds the MCH value, ..., abs. basophils holds the abs.
   eosinophil value, and the true abs. basophil value fell off the end).
   Evidence, all from the row itself: "absolute lymphocytes" 6826 equals
   neutrophils 71.1 % x WBC 9.6 k; "MCHC" 29.6 equals Hgb / RBC (an MCH);
   "platelets" 12.9 is an RDW; "MPV" 330 is a platelet count.
   The fix moves each value back one place, rebuilds abs. basophils from
   basophils % x WBC (the only value that is reconstructed, not recovered),
   copies the MCH reference range used on every other row, and then asserts
   that every row of the corrected file passes the CBC identities below.
   MCV, Hct, Hgb, RBC, WBC and all percentages are not touched by the shift.

2. The MCV headline (personal range vs population range), per crew member.

3. Index of individuality (Harris 1974): II = CV_I / CV_G from the 3 pre-flight
   draws. See ii_table() for exactly how each CV is computed.
"""
import csv
import io
import json
import math
import os
import statistics as st

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
DERIVED = os.path.join(ROOT, "data", "derived")
CBC_RAW = os.path.join(RAW, "LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv")
CMP_RAW = os.path.join(RAW, "LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv")
CBC_OUT = os.path.join(DERIVED, "cbc_corrected.csv")
JSON_OUT = os.path.join(ROOT, "src", "data", "i4_proof.json")

PRE = ["L-92", "L-44", "L-3"]
POST = ["R+1", "R+45", "R+82", "R+194"]
TPS = PRE + POST
DAY = {"L-92": -92, "L-44": -44, "L-3": -3, "R+1": 1, "R+45": 45, "R+82": 82, "R+194": 194}
II_CUTOFF = 0.6  # Harris 1974 / Fraser: below this, population ranges are insensitive to personal change

# Lab report order of the shifted run (see module docstring). Value at
# SHIFT_CHAIN[i+1] in the raw row belongs to SHIFT_CHAIN[i].
SHIFT_CHAIN = ["mch", "mchc", "rdw", "platelet_count", "mpv", "absolute_neutrophils",
               "absolute_lymphocytes", "absolute_monocytes", "absolute_eosinophils", "absolute_basophils"]
DIFF = ["neutrophils", "lymphocytes", "monocytes", "eosinophils", "basophils"]

LABELS = {
    "absolute_basophils": "Basophils (count)", "absolute_eosinophils": "Eosinophils (count)",
    "absolute_lymphocytes": "Lymphocytes (count)", "absolute_monocytes": "Monocytes (count)",
    "absolute_neutrophils": "Neutrophils (count)", "basophils": "Basophils (%)", "eosinophils": "Eosinophils (%)",
    "hematocrit": "Hematocrit", "hemoglobin": "Hemoglobin", "lymphocytes": "Lymphocytes (%)", "mch": "MCH",
    "mchc": "MCHC", "mcv": "MCV (red cell size)", "monocytes": "Monocytes (%)", "mpv": "MPV (platelet size)",
    "neutrophils": "Neutrophils (%)", "platelet_count": "Platelets", "rdw": "RDW", "red_blood_cell_count": "Red blood cells",
    "white_blood_cell_count": "White blood cells", "albumin": "Albumin", "albumin_to_globulin_ratio": "Albumin/globulin ratio",
    "alkaline_phosphatase": "Alkaline phosphatase", "alt": "ALT (liver enzyme)", "ast": "AST (liver enzyme)",
    "total_bilirubin": "Bilirubin", "bun_to_creatinine_ratio": "BUN/creatinine ratio", "calcium": "Calcium",
    "carbon_dioxide": "Bicarbonate (CO2)", "chloride": "Chloride", "creatinine": "Creatinine",
    "egfr_african_american": "eGFR (race-adjusted)", "egfr_non_african_american": "eGFR",
    "globulin": "Globulin", "glucose": "Glucose", "potassium": "Potassium", "total_protein": "Total protein",
    "sodium": "Sodium", "urea_nitrogen_bun": "Urea nitrogen (BUN)",
}
# eGFR is a formula of creatinine, age and sex (the two columns differ only by a race
# multiplier), so it is not an independent measurement: left out of the II table.
II_SKIP = {"egfr_african_american": "calculated from creatinine; duplicates creatinine",
           "egfr_non_african_american": "calculated from creatinine; duplicates creatinine"}

SOURCES = [
    {"id": "OSD-569", "panel": "CBC", "file": "LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv",
     "title": "Whole Blood Measurements from the SpaceX Inspiration4 Mission (RNA-seq, epitranscriptome, WGS, clonal hematopoiesis, CBC)",
     "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-569",
     "download": "https://osdr.nasa.gov/geode-py/ws/studies/OSD-569/download?source=datamanager&file=LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv"},
    {"id": "OSD-575", "panel": "CMP", "file": "LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv",
     "title": "SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays (Comprehensive Metabolic Panel and Multiplex)",
     "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
     "download": "https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?source=datamanager&file=LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv"},
]


# ----------------------------------------------------------------- reading
def read_csv(path):
    """Return (header, rows) with rows as dicts of raw strings. BOM stripped."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        r = csv.reader(f)
        header = next(r)
        rows = [dict(zip(header, line)) for line in r if line]
    return header, rows


def num(s):
    if s is None:
        return None
    s = s.strip()
    if s == "" or s.upper() == "NA":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def col(header, analyte, kind="value"):
    """Full column name for e.g. ('mcv', 'value') -> 'mcv_value_femtoliter'."""
    hits = [h for h in header if h.startswith(f"{analyte}_{kind}")]
    assert len(hits) == 1, f"{analyte}_{kind}: {hits}"
    return hits[0]


def analytes(header):
    return [h.split("_value")[0] for h in header if "_value" in h]


def unit_of(header, analyte):
    c = col(header, analyte)
    u = c.split("_value", 1)[1].lstrip("_")
    return {"cells_per_microliter": "cells/µL", "percent": "%", "picogram": "pg", "grams_per_deciliter": "g/dL",
            "femtoliter": "fL", "thousand_per_microliter": "thousand/µL", "million_per_microliter": "million/µL",
            "gram_per_deciliter": "g/dL", "units_per_liter": "U/L", "milligram_per_deciliter": "mg/dL",
            "millimol_per_liter": "mmol/L", "": "ratio"}.get(u, u.replace("_", " "))


def sample(name):
    p = name.split("_")
    return p[0], next(x for x in p if x.startswith(("L-", "R+")))


# ----------------------------------------------------------------- CBC identities
def cbc_checks(row, header):
    """Return a list of (name, ok, detail) for the identities a CBC row must satisfy.

    abs. count = % x WBC (cells/µL = % x thousand/µL x 10)   tolerance max(2, 1 %)
    MCH  = Hgb / RBC x 10      (pg)     tolerance 0.15
    MCHC = Hgb / Hct x 100     (g/dL)   tolerance 0.15
    MCV  = Hct / RBC x 10      (fL)     tolerance 0.15
    and each value inside a physiologically possible span.
    ok is None when a value the check needs is blank in the source (missing, not wrong).
    """
    g = lambda a: num(row[col(header, a)])
    out = []
    wbc = g("white_blood_cell_count")
    for a in DIFF:
        pct, ab = g(a), g("absolute_" + a)
        exp = pct * wbc * 10
        ok = None if ab is None else abs(ab - exp) <= max(2.0, 0.01 * exp)
        out.append((f"absolute_{a} = {a}% x WBC", ok, f"{ab} vs {exp:.1f}"))
    hgb, hct, rbc = g("hemoglobin"), g("hematocrit"), g("red_blood_cell_count")
    for a, exp in (("mch", hgb / rbc * 10), ("mchc", hgb / hct * 100), ("mcv", hct / rbc * 10)):
        v = g(a)
        out.append((f"{a} from Hgb/Hct/RBC", None if v is None else abs(v - exp) <= 0.15, f"{v} vs {exp:.2f}"))
    spans = {"platelet_count": (20, 1500), "mpv": (5, 15), "rdw": (9, 30)}
    for a, (lo, hi) in spans.items():
        v = g(a)
        out.append((f"{a} in possible span {lo}-{hi}", None if v is None else lo <= v <= hi, f"{v}"))
    return out


def fix_cbc(header, rows):
    """Detect and undo the one-place shift. Returns (fixed_rows, fix_report)."""
    fixed = [dict(r) for r in rows]
    bad = [i for i, r in enumerate(rows) if any(ok is False for _, ok, _ in cbc_checks(r, header))]
    assert len(bad) == 1, f"expected exactly one inconsistent CBC row, found {[rows[i]['Sample Name'] for i in bad]}"
    i = bad[0]
    raw = rows[i]
    name = raw["Sample Name"]
    assert name == "C003_whole-blood_L-92_cbc", name
    assert num(raw[col(header, "mch")]) is None, "shift signature: MCH must be blank"

    r = fixed[i]
    moves = []
    for a, src in zip(SHIFT_CHAIN, SHIFT_CHAIN[1:]):
        r[col(header, a)] = raw[col(header, src)]
        moves.append({"column": a, "raw": num(raw[col(header, a)]), "corrected": num(raw[col(header, src)]),
                      "takenFrom": src})
    # The last value in the chain was pushed off the row. Rebuild it from % x WBC.
    wbc = num(raw[col(header, "white_blood_cell_count")])
    baso = round(num(raw[col(header, "basophils")]) * wbc * 10)
    last = SHIFT_CHAIN[-1]
    r[col(header, last)] = str(baso)
    moves.append({"column": last, "raw": num(raw[col(header, last)]), "corrected": float(baso),
                  "takenFrom": "reconstructed: basophils % x WBC (the true value was pushed off the raw row)"})
    # MCH reference range is blank on this row; every row that prints one uses the same range.
    reconstructed = [{"column": last, "value": baso, "how": "basophils % x WBC = "
                      f"{num(raw[col(header, 'basophils')])} x {wbc} x 10"}]
    for kind in ("range_min", "range_max"):
        c = col(header, "mch", kind)
        others = {rr[c] for j, rr in enumerate(rows) if j != i and rr[c].strip()}
        assert len(others) == 1, f"MCH {kind} differs between rows: {others}"
        r[c] = others.pop()
        reconstructed.append({"column": c, "value": num(r[c]), "how": "same MCH reference range as every other row that prints one"})

    before = cbc_checks(raw, header)
    after = cbc_checks(r, header)
    for nm, ok, det in after:
        assert ok is True, f"after fix, {name}: {nm} is {ok} ({det})"
    assert sum(ok is False for _, ok, _ in before) >= 5, "the raw row should fail several identities"
    for rr in fixed:
        for nm, ok, det in cbc_checks(rr, header):
            assert ok is not False, f"corrected file, {rr['Sample Name']}: {nm} fails ({det})"
    # The headline marker is not part of the shifted run.
    for a in ("mcv", "hematocrit", "hemoglobin", "red_blood_cell_count", "white_blood_cell_count"):
        assert r[col(header, a)] == raw[col(header, a)]

    return fixed, {
        "row": name,
        "file": os.path.basename(CBC_RAW),
        "summary": ("MCH is blank and the next ten values in the lab's report order each sit one place late. "
                    "Example: 'absolute lymphocytes' 6826 is really the neutrophil count (71.1% x 9.6 thousand/µL)."),
        "detectedBy": "the only row in the file that fails the CBC identities (counts = % x WBC; MCH, MCHC, MCV from Hgb, Hct, RBC)",
        "moves": moves,
        "reconstructed": reconstructed,
        "checksBefore": [{"check": nm, "ok": ok, "detail": det} for nm, ok, det in before],
        "checksAfter": [{"check": nm, "ok": ok, "detail": det} for nm, ok, det in after],
        "mcvAffected": False,
        "note": "MCV, hemoglobin, hematocrit, RBC, WBC and every percentage are unaffected, so the MCV headline does not depend on the fix.",
    }


def write_cbc(header, rows, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    for r in rows:
        w.writerow([r[h] for h in header])
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(buf.getvalue())


# ----------------------------------------------------------------- tables
def by_crew(header, rows, analyte):
    """{crew: {timepoint: value}} for one analyte."""
    c = col(header, analyte)
    d = {}
    for r in rows:
        crew, tp = sample(r["Sample Name"])
        v = num(r[c])
        if v is not None:
            d.setdefault(crew, {})[tp] = v
    return d


def ranges(header, rows, analyte):
    lo, hi = col(header, analyte, "range_min"), col(header, analyte, "range_max")
    return {(num(r[lo]), num(r[hi])) for r in rows if num(r[lo]) is not None}


def rnd(x, d=3):
    return None if x is None else round(x, d)


# ----------------------------------------------------------------- MCV headline
def mcv_result(header, rows):
    rr = ranges(header, rows, "mcv")
    assert rr == {(80.0, 100.0)}, rr
    pop_lo, pop_hi = rr.pop()
    d = by_crew(header, rows, "mcv")
    crew_out = []
    for crew in sorted(d):
        s = d[crew]
        pre = [s[t] for t in PRE]
        lo, hi = min(pre), max(pre)
        r1, r194 = s["R+1"], s.get("R+194")  # C002 R+194 MCV is blank in the source
        crew_out.append({
            "crew": crew,
            "series": [{"timepoint": t, "day": DAY[t], "value": s[t]} for t in TPS if t in s],
            "preMin": lo, "preMax": hi, "preMedian": st.median(pre),
            "r1": r1,
            "r1BelowOwnMin": r1 < lo,
            "r1InsidePopulation": pop_lo <= r1 <= pop_hi,
            "r1MinusOwnMin": round(r1 - lo, 2),
            "r194": r194,
            "r194BelowOwnMin": None if r194 is None else r194 < lo,
        })
    n = len(crew_out)
    below = sum(c["r1BelowOwnMin"] for c in crew_out)
    inside = sum(c["r1InsidePopulation"] for c in crew_out)
    return {
        "analyte": "mcv", "label": "MCV (mean red blood cell size)", "unit": "fL",
        "population": {"low": pop_lo, "high": pop_hi, "source": "Lab reference range printed in the OSD-569 file (same on every row)"},
        "personalRule": "Own range = lowest to highest of the 3 pre-flight draws (L-92, L-44, L-3).",
        "crew": crew_out,
        "result": {"n": n, "belowOwnMinAtR1": below, "insidePopulationAtR1": inside,
                   "stillBelowOwnMinAtR194": sum(c["r194BelowOwnMin"] is True for c in crew_out),
                   "r194Available": sum(c["r194"] is not None for c in crew_out)},
        "caption": "Population range: 4 of 4 fine. Personal range: 4 of 4 changed." if (below, inside, n) == (4, 4, 4) else
                   f"Population range: {inside} of {n} fine. Personal range: {below} of {n} changed.",
    }


# ----------------------------------------------------------------- index of individuality
def ii_table(panels):
    """Harris (1974) index of individuality, II = CV_I / CV_G, from the 3 pre-flight draws.

    For each analyte with all 3 pre-flight values for all 4 crew (k = 4, n = 3):
      CV_I (within person)  = root-mean-square of the 4 per-person CVs,
                              each = sample SD (n-1) of that person's 3 draws / their mean.
                              Analytical variation cannot be separated here, so CV_I includes
                              it (Harris's sqrt(CV_I^2 + CV_A^2)); this makes II larger,
                              i.e. conservative for the "II < 0.6" count.
      CV_G (between people) = sample SD (n-1) of the 4 person means / the mean of those means.
    Sensitivity check, the ANOVA variance-component form used by Fraser & Harris (1989):
      CV_I = sqrt(MS_within) / grand mean,
      CV_G = sqrt(max(0, (MS_between - MS_within) / 3)) / grand mean.
    """
    out = []
    skipped = []
    for panel, header, rows in panels:
        for a in analytes(header):
            if a in II_SKIP:
                skipped.append({"analyte": a, "label": LABELS.get(a, a), "why": II_SKIP[a]})
                continue
            d = by_crew(header, rows, a)
            pre = {c: [d[c][t] for t in PRE if t in d.get(c, {})] for c in sorted({sample(r["Sample Name"])[0] for r in rows})}
            if any(len(v) < 3 for v in pre.values()):
                skipped.append({"analyte": a, "label": LABELS.get(a, a), "why": "missing pre-flight values"})
                continue
            means = [st.mean(v) for v in pre.values()]
            cvis = [st.stdev(v) / st.mean(v) for v in pre.values()]
            cvi = math.sqrt(st.mean([x * x for x in cvis]))
            cvg = st.stdev(means) / st.mean(means)
            # ANOVA form
            k, n = len(pre), 3
            gm = st.mean(means)
            msw = sum((x - st.mean(v)) ** 2 for v in pre.values() for x in v) / (k * (n - 1))
            msb = n * sum((m - gm) ** 2 for m in means) / (k - 1)
            sg = math.sqrt(max(0.0, (msb - msw) / n))
            ii_anova = (math.sqrt(msw) / gm) / (sg / gm) if sg > 0 else None
            out.append({
                "analyte": a, "label": LABELS.get(a, a), "panel": panel, "unit": unit_of(header, a),
                "cvI": round(cvi * 100, 1), "cvG": round(cvg * 100, 1), "ii": round(cvi / cvg, 2),
                "iiAnova": rnd(ii_anova, 2),
            })
    out.sort(key=lambda r: (r["ii"], r["analyte"]))
    below = [r for r in out if r["ii"] < II_CUTOFF]
    below_anova = [r for r in out if r["iiAnova"] is not None and r["iiAnova"] < II_CUTOFF]
    return {
        "cutoff": II_CUTOFF,
        "n": len(out),
        "below": len(below),
        "belowAnalytes": [r["analyte"] for r in below],
        "method": ("II = CV_I / CV_G (Harris 1974), from the 3 pre-flight draws of each of the 4 crew. "
                   "CV_I = root-mean-square of each person's own CV (sample SD / mean of their 3 draws); "
                   "CV_G = sample SD of the 4 personal means / their mean. Lab (analytical) noise cannot be "
                   "separated, so it is inside CV_I; that makes II larger, not smaller."),
        "cutoffNote": ("Below about 0.6 a population reference range is poor at spotting a change in one person; "
                       "above about 1.4 it works well (Harris 1974; Fraser & Harris 1989)."),
        "sensitivity": {"method": "ANOVA variance components (Fraser & Harris 1989)", "n": sum(r["iiAnova"] is not None for r in out),
                        "below": len(below_anova),
                        "note": "With only 4 people x 3 draws, between-person variance from ANOVA can be zero or tiny, so this form is noisier."},
        "skipped": skipped,
        "rows": out,
    }


# ----------------------------------------------------------------- caveat data
def glucose_exclusion(cmp_header, cmp_rows):
    g = by_crew(cmp_header, cmp_rows, "glucose")
    k = by_crew(cmp_header, cmp_rows, "potassium")
    pre_min = {c: min(g[c][t] for t in PRE) for c in g}
    low = [c for c in sorted(g) if g[c]["R+45"] < 50]
    return {
        "analyte": "glucose",
        "r45": [{"crew": c, "glucose": g[c]["R+45"], "potassium": k[c]["R+45"], "ownPreflightMinGlucose": pre_min[c]} for c in sorted(g)],
        "lowAtR45": low,
        "why": (f"At R+45, {len(low)} of 4 crew had glucose of {int(min(g[c]['R+45'] for c in low))}-"
                f"{int(max(g[c]['R+45'] for c in low))} mg/dL (one with potassium {max(k[c]['R+45'] for c in low)} mmol/L) "
                "while feeling well on the ground. Low glucose with high potassium is the classic sign of a blood sample "
                "left too long before the serum was separated (cells keep using sugar and leak potassium). "
                "So glucose is left out of the headline."),
    }


def lymphocyte_retraction(header, rows_raw, rows_fixed):
    """The previous app claim ('hidden lymphocyte drift in 4 of 4 crew'), recomputed."""
    def pct(rows):
        d = by_crew(header, rows, "absolute_lymphocytes")
        return {c: round(100 * (d[c]["R+1"] - st.median([d[c][t] for t in PRE])) / st.median([d[c][t] for t in PRE]), 1)
                for c in sorted(d)}
    raw, fx = pct(rows_raw), pct(rows_fixed)
    return {
        "claim": "Hidden lymphocyte drift (> 20% from own pre-flight median, inside the lab range) in 4 of 4 crew at R+1",
        "status": "withdrawn",
        "r1PctVsOwnMedianRawFile": raw,
        "r1PctVsOwnMedianCorrected": fx,
        "beyond20PctCorrected": sum(abs(v) > 20 for v in fx.values()),
        "why": ("C003's pre-flight median was inflated by the shifted row (6826 is a neutrophil count). With the row fixed, "
                "C003 changed by about 0%, and the directions disagree (two down, one up), so there is no consistent signal."),
    }


# ----------------------------------------------------------------- main
def build():
    cbc_header, cbc_rows = read_csv(CBC_RAW)
    cmp_header, cmp_rows = read_csv(CMP_RAW)
    assert len(cbc_rows) == 28 and len(cmp_rows) == 28
    fixed, fix = fix_cbc(cbc_header, cbc_rows)
    write_cbc(cbc_header, fixed, CBC_OUT)

    mcv = mcv_result(cbc_header, fixed)
    ii = ii_table([("CBC", cbc_header, fixed), ("CMP", cmp_header, cmp_rows)])
    glu = glucose_exclusion(cmp_header, cmp_rows)
    lym = lymphocyte_retraction(cbc_header, cbc_rows, fixed)
    r = mcv["result"]
    proof = {
        "schema": 1,
        "title": "Inspiration4: inside everyone's range, outside their own",
        "headline": (f"The day after landing, all {r['n']} Inspiration4 crew had a mean red-cell size (MCV) inside the "
                     f"population range ({mcv['population']['low']:g}-{mcv['population']['high']:g} fL) and below "
                     "their own lowest pre-flight value."),
        "claimStrength": "consistent with a personal change after flight; not proof of one",
        "sources": SOURCES,
        "crew": 4,
        "timepoints": [{"timepoint": t, "day": DAY[t]} for t in TPS],
        "fix": fix,
        "mcv": mcv,
        "ii": ii,
        "excluded": [glu],
        "withdrawn": [lym],
        "limits": [
            {"id": "n4", "text": "Only 4 people."},
            {"id": "pre3", "text": "Only 3 pre-flight draws each, so each person's own range is a rough one."},
            {"id": "flight", "text": "A 3-day flight in low Earth orbit, not a Mars mission."},
            {"id": "noinflight", "text": "No blood was drawn in flight; every comparison is after landing."},
            {"id": "r194", "text": (f"MCV is still below the pre-flight minimum at R+194, half a year later, in "
                                    f"{r['stillBelowOwnMinAtR194']} of the {r['r194Available']} crew with an R+194 value "
                                    "(C002's is blank in the NASA file). A change of lab or analyzer after flight may explain part of the "
                                    "shift, so the result is 'consistent with', not 'proves'.")},
            {"id": "glucose", "text": "Glucose is excluded: the R+45 values look like a sample-handling artefact (low sugar, high potassium)."},
            {"id": "notclinical", "text": "An illustration of personal baselines, not clinical evidence and not a prediction for Mars."},
        ],
        "computedBy": {
            "python": "analysis/i4_proof.py (row fix, MCV comparison, index of individuality, exclusions)",
            "engine": "scripts/proof.mjs runs computeBaseline() from src/engine/baseline.ts (the app's own band code) on the same corrected file",
            "reproduce": "npm run proof   (python3 -I analysis/i4_proof.py && node scripts/proof.mjs)",
        },
    }
    # keep the engine section written by scripts/proof.mjs only if its inputs did not change
    try:
        with open(JSON_OUT, encoding="utf-8") as f:
            old = json.load(f)
        if old.get("engine") and old["engine"].get("inputs") == engine_inputs(mcv):
            proof["engine"] = old["engine"]
    except (OSError, ValueError):
        pass
    os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(proof, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return proof


def engine_inputs(mcv):
    """What scripts/proof.mjs feeds the engine; used to tell if its saved result is stale."""
    return {c["crew"]: [p["value"] for p in c["series"] if p["timepoint"] in PRE] for c in mcv["crew"]}


def main():
    p = build()
    m = p["mcv"]
    print(f"wrote {os.path.relpath(CBC_OUT, ROOT)} and {os.path.relpath(JSON_OUT, ROOT)}")
    print(f"  fixed row {p['fix']['row']}: {len(p['fix']['moves']) - 1} values moved back, abs. basophils rebuilt = "
          f"{p['fix']['reconstructed'][0]['value']}")
    for c in m["crew"]:
        print(f"  MCV {c['crew']}: R+1 {c['r1']} vs own pre-flight {c['preMin']}-{c['preMax']} "
              f"({'below' if c['r1BelowOwnMin'] else 'not below'} own min; "
              f"{'inside' if c['r1InsidePopulation'] else 'outside'} 80-100); R+194 {c['r194']}")
    print(f"  {m['caption']}  (R+194 still below own min: {m['result']['stillBelowOwnMinAtR194']}/4)")
    ii = p["ii"]
    print(f"  II < {ii['cutoff']}: {ii['below']} of {ii['n']} analytes "
          f"(ANOVA form: {ii['sensitivity']['below']} of {ii['sensitivity']['n']})")
    print("   ", ", ".join(f"{r['analyte']} {r['ii']}" for r in ii["rows"] if r["ii"] < ii["cutoff"]))
    print(f"  skipped: {', '.join(s['analyte'] for s in ii['skipped'])}")
    print(f"  lymphocytes R+1 (corrected): {p['withdrawn'][0]['r1PctVsOwnMedianCorrected']}")
    if "engine" not in p:
        print("  engine section missing: run `node scripts/proof.mjs` next")


if __name__ == "__main__":
    main()
