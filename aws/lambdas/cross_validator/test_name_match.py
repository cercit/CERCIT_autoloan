"""Checks for the cross-document name match (made-up names). Same cases as the SQL tests for 090.

Run:  python test_name_match.py
"""

import sys
import types

for name in ("boto3",):
    if name not in sys.modules:
        try:
            __import__(name)
        except ImportError:
            m = types.ModuleType(name)
            m.client = lambda *a, **k: None
            sys.modules[name] = m

import handler as h  # noqa: E402

fails = 0


def check(label, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(("ok  " if ok else "FAIL"), label, "" if ok else f"(got {got!r}, want {want!r})")


check("an initial matches its word", h.name_score("SAMEER S MITTIMANI", "Sameer Shreenivas Mittimani"), 1.0)
check("Mohd = Mohammed", h.name_score("Mohd Irfan Khan", "MOHAMMED IRFAN KHAN"), 1.0)
check("Laxmi = Lakshmi", h.name_score("Laxmi Devi", "LAKSHMI DEVI"), 1.0)
check("Shreenivas = Srinivasa", h.name_score("Shreenivas Rao", "Srinivasa Rao"), 1.0)
check("one wrong letter in a long word", h.name_score("SAMEER MITTlMANI", "Sameer Mittimani"), 1.0)
check("a capital I read as l (094)", h.name_score("ASHA RAMESH lyer", "Asha Ramesh Iyer"), 1.0)
check("0 for O and 1 for I (094)", [h.name_score("M0HAN SHARMA", "Mohan Sharma"), h.name_score("SAMEER M1TTIMANI", "Sameer Mittimani")], [1.0, 1.0])
check("titles dropped", h.name_score("Mr. Sameer Mittimani", "SAMEER MITTIMANI"), 1.0)
check("different people", h.name_score("Asha R", "Priya Sharma"), 0.0)
check("short words must be exact", h.name_score("Ram Kumar", "Raj Verma"), 0.0)
check("initials alone never pass", h.name_score("M S", "Mohan Sharma"), 0.0)

checks = h._check_name_consistency({
    "pan_card": {"name": {"value": "SAMEER S MITTIMANI"}},
    "aadhaar_card": {"name": {"value": "Sameer Shreenivas Mittimani"}},
})
check("PAN with an initial vs full Aadhaar name now passes (it failed at 0.67 before)", [c["passed"] for c in checks], [True])

check("employers: Pvt Ltd and Private Limited are the same company",
      h.org_score("Acme Motors Pvt Ltd", "ACME MOTORS PRIVATE LIMITED"), 1.0)
emp = h._check_employer_match({"salary_slip": {"employer_name": {"value": "Acme Motors Pvt Ltd"}},
                               "form16": {"employer_name": {"value": "ACME MOTORS PRIVATE LIMITED"}}})
check("employer check passes on the same company", [c["passed"] for c in emp], [True])

print("\nall passed" if not fails else f"\n{fails} failed")
sys.exit(1 if fails else 0)
