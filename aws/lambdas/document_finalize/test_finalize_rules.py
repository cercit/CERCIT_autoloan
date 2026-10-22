"""Checks for the Aadhaar keep-or-refuse rules in handler.py (made-up numbers only).

Run:  python test_finalize_rules.py
boto3 isn't needed: a stand-in is used, since these rules never call AWS.
"""

import sys
import types

if "boto3" not in sys.modules:
    fake = types.ModuleType("boto3")
    fake.client = lambda *a, **k: None
    sys.modules["boto3"] = fake
    core = types.ModuleType("botocore")
    cfg = types.ModuleType("botocore.config")
    cfg.Config = lambda *a, **k: None
    sys.modules["botocore"] = core
    sys.modules["botocore.config"] = cfg
for name in ("zxingcpp",):
    if name not in sys.modules:
        try:
            __import__(name)
        except ImportError:
            sys.modules[name] = types.ModuleType(name)

import handler as h  # noqa: E402

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(("ok  " if ok else "FAIL"), name, "" if ok else f"(got {got!r}, want {want!r})")


# a printed number, 4-4-4: the first two groups are hidden
check("4-4-4 number found", h.aadhaar_spans(["Aadhaar", "2345", "6789", "0123"]), [(1, 2)])
check("VID (4-4-4-4) left alone", h.aadhaar_spans(["VID", "9123", "4567", "8901", "2345"]), [])
check("12 digits in one word", h.aadhaar_spans(["234567890123"]), [(0, -1)])

# an Aadhaar already masked by UIDAI
check("masked: XXXX XXXX 1234", h.already_masked(["Your", "Aadhaar", "No.", "XXXX", "XXXX", "1234"]), True)
check("masked: lower case", h.already_masked(["xxxx", "xxxx", "1234"]), True)
check("masked: one word", h.already_masked(["XXXXXXXX1234"]), True)
check("masked: dashes", h.already_masked(["XXXX-XXXX-1234"]), True)
check("not masked: plain digits", h.already_masked(["2345", "6789", "0123"]), False)
check("not masked: no number", h.already_masked(["Government", "of", "India"]), False)

# keep or refuse
check("keep when the number was hidden", h.aadhaar_ok(number_hidden=1, already=False), True)
check("keep when UIDAI already masked it", h.aadhaar_ok(number_hidden=0, already=True), True)
check("refuse when no number found", h.aadhaar_ok(number_hidden=0, already=False), False)

# page limit
check("10 pages allowed", h.too_many_pages(10), False)
check("11 pages refused", h.too_many_pages(11), True)

print("\nall passed" if not fails else f"\n{fails} failed")
sys.exit(1 if fails else 0)
