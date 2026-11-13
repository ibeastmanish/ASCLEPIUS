#!/usr/bin/env python3
"""Checks for the C003 L-92 row fix.   python3 -I analysis/test_i4_proof.py

Stdlib unittest. Loads analysis/i4_proof.py by path (python -I does not put the
script's folder on sys.path) and checks, on the raw NASA file:
  - exactly one row breaks the CBC identities, and it is C003 L-92;
  - after the fix that row passes every identity (counts = % x WBC, MCH/MCHC/MCV);
  - hand-checked values: abs. neutrophils 6826 ~= 71.1 % x 9.6 k, platelets 330, RDW 12.9;
  - only the ten shifted columns (plus the blank MCH range) change, nothing else;
  - the raw file is unchanged (SHA-256 from data/manifest.json).
"""
import hashlib
import importlib.util
import json
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("i4_proof", os.path.join(HERE, "i4_proof.py"))
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)


class ShiftFix(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h, cls.raw = P.read_csv(P.CBC_RAW)
        cls.fixed, cls.report = P.fix_cbc(cls.h, cls.raw)
        cls.i = next(i for i, r in enumerate(cls.raw) if r["Sample Name"] == "C003_whole-blood_L-92_cbc")

    def v(self, row, analyte):
        return P.num(row[P.col(self.h, analyte)])

    def test_only_c003_l92_is_inconsistent_in_raw(self):
        bad = [r["Sample Name"] for r in self.raw if any(ok is False for _, ok, _ in P.cbc_checks(r, self.h))]
        self.assertEqual(bad, ["C003_whole-blood_L-92_cbc"])

    def test_fixed_row_reconciles(self):
        row = self.fixed[self.i]
        for name, ok, detail in P.cbc_checks(row, self.h):
            self.assertIs(ok, True, f"{name}: {detail}")
        wbc = self.v(row, "white_blood_cell_count")
        self.assertAlmostEqual(self.v(row, "absolute_neutrophils"), 71.1 * wbc * 10, delta=2)
        self.assertAlmostEqual(self.v(row, "absolute_lymphocytes"), 20.8 * wbc * 10, delta=2)
        self.assertEqual(self.v(row, "platelet_count"), 330)
        self.assertEqual(self.v(row, "rdw"), 12.9)
        self.assertEqual(self.v(row, "mpv"), 10.1)
        self.assertAlmostEqual(self.v(row, "mch"), self.v(row, "hemoglobin") / self.v(row, "red_blood_cell_count") * 10, delta=0.1)

    def test_every_corrected_row_has_no_failing_identity(self):
        for r in self.fixed:
            for name, ok, detail in P.cbc_checks(r, self.h):
                self.assertIsNot(ok, False, f"{r['Sample Name']} {name}: {detail}")

    def test_only_shifted_columns_change(self):
        changed = {h for h in self.h if self.fixed[self.i][h] != self.raw[self.i][h]}
        allowed = {P.col(self.h, a) for a in P.SHIFT_CHAIN} | {P.col(self.h, "mch", "range_min"), P.col(self.h, "mch", "range_max")}
        self.assertTrue(changed <= allowed, changed - allowed)
        for j, r in enumerate(self.raw):
            if j != self.i:
                self.assertEqual(r, self.fixed[j])
        self.assertEqual(self.v(self.fixed[self.i], "mcv"), self.v(self.raw[self.i], "mcv"))

    def test_raw_file_untouched(self):
        with open(os.path.join(P.ROOT, "data", "manifest.json")) as f:
            want = json.load(f)["files"]["raw/LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv"]["sha256"]
        with open(P.CBC_RAW, "rb") as f:
            self.assertEqual(hashlib.sha256(f.read()).hexdigest(), want)

    def test_derived_file_matches_pipeline(self):
        h, rows = P.read_csv(P.CBC_OUT)
        self.assertEqual(h, self.h)
        self.assertEqual(rows, self.fixed)


if __name__ == "__main__":
    unittest.main(verbosity=1)
