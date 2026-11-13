# data/derived

Files made from `data/raw/` by code. Do not edit them by hand. Rebuild with `npm run proof`, which runs `python3 -I analysis/i4_proof.py` and then `node scripts/proof.mjs`.

## cbc_corrected.csv

This is a copy of `data/raw/LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv` (NASA OSDR OSD-569, Inspiration4 complete blood count) with one row fixed. The raw NASA file is never modified, and `analysis/test_i4_proof.py` checks its SHA-256 against `data/manifest.json`.

### What is wrong in the NASA file

In row `C003_whole-blood_L-92_cbc`, MCH is blank. The next ten values, taken in the lab report's own order, each sit one place too late:

| Column in the file | Raw value | What the value really is | Corrected value |
|---|---|---|---|
| mch | *(blank)* | | 29.6 |
| mchc | 29.6 | MCH (= Hgb 13.2 / RBC 4.46 × 10) | 32.4 |
| rdw | 32.4 | MCHC (= Hgb / Hct × 100) | 12.9 |
| platelet_count | 12.9 | RDW | 330 |
| mpv | 330 | platelet count | 10.1 |
| absolute_neutrophils | 10.1 | MPV | 6826 |
| absolute_lymphocytes | 6826 | neutrophils (71.1 % × 9.6 k) | 1997 |
| absolute_monocytes | 1997 | lymphocytes (20.8 % × 9.6 k) | 614 |
| absolute_eosinophils | 614 | monocytes (6.4 % × 9.6 k) | 125 |
| absolute_basophils | 125 | eosinophils (1.3 % × 9.6 k) | 38 *(rebuilt)* |

### How it was fixed (`fix_cbc()` in `analysis/i4_proof.py`)

1. **Detect.** Every CBC row must satisfy these identities: each absolute count = its % × WBC; MCH = Hgb/RBC; MCHC = Hgb/Hct; MCV = Hct/RBC; platelets, MPV and RDW within possible values. In this file the other 27 rows match to within rounding (±0.5 cells/µL, ±0.05 for the indices). `C003_whole-blood_L-92_cbc` is the only row that fails, and it fails 9 checks. The code asserts that exactly this one row fails.
2. **Shift back.** Each of the ten values moves back one place along the chain above.
3. **Rebuild one value.** The true absolute basophil count fell off the end of the row and cannot be recovered. It is rebuilt as basophils % × WBC = 0.4 × 9.6 × 10 = 38.4, rounded to 38. This is the only number in the file that is computed rather than recovered.
4. **Fill the MCH reference range** (27-33 pg). It is blank on this row, and every row that prints an MCH range uses that one.
5. **Assert.** After the fix, the row passes every identity. No row in the corrected file fails any identity. Only the shifted columns changed.

MCV, hemoglobin, hematocrit, RBC, WBC and all percentages are **not** part of the shift, so the MCV headline does not depend on this fix. For C003 L-92, MCV 91.3 = Hct 40.7 / RBC 4.46 × 10.

### Blanks left as they are

These values are blank in the NASA file and stay blank: MCHC for C002 at L-92, L-44, L-3 and R+1; MCV for C002 at R+194; MCH for C004 at L-92. They are missing values, not shifts: every identity that can be checked on those rows passes.

### Cross-check

An earlier hand-corrected copy (`research_notes/v3_evidence/cbc_fixed.csv`) has the same values as this file. The only difference is that it left the MCH reference range blank.
