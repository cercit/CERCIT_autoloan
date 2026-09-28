"""Line-by-line reading of downloaded e-Aadhaar / e-PAN PDFs, on made-up documents.
Run: python aws/lambdas/kyc_extractor/test_lines.py"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "shared", "python"))
sys.path.insert(0, HERE)
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")

try:
    import boto3  # noqa: F401
except ImportError:  # the readers are plain functions; no AWS needed to test them
    import types
    sys.modules["boto3"] = types.SimpleNamespace(client=lambda *a, **k: None)

import handler  # noqa: E402


def blocks(*lines):
    return [{"BlockType": "LINE", "Text": t} for t in lines]


def check(name, got, want):
    ok = got == want
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f": got {got!r}, want {want!r}"))
    return ok


results = []

# e-Aadhaar: letter at the top, card at the bottom, masked number, bilingual labels.
aad = blocks(
    "Enrolment No.: 1234/12345/12345",
    "To",
    "Asha Test",
    "C/O: Late Ravi Test",
    "12, Test Apartments, 2nd Cross",
    "Test Nagar, Near Test Temple",
    "Bengaluru Urban, Karnataka - 560001",
    "Mobile: XXXXXX1234",
    "Your Aadhaar No. :",
    "XXXX XXXX 5678",
    "Government of India",
    "Asha Test",
    "जन्म तिथि/DOB: 02/06/1991",
    "महिला/ FEMALE",
    "XXXX XXXX 5678",
    "VID : 9123 4567 8912 3456",
)
f = handler._extract_aadhaar({}, handler._get_all_text(aad))
handler._aadhaar_from_lines(f, handler._lines(aad))
results += [
    check("aadhaar dob", f.get("dob", {}).get("value"), "02/06/1991"),
    check("aadhaar gender", f.get("gender", {}).get("value"), "FEMALE"),
    check("aadhaar name", f.get("name", {}).get("value"), "Asha Test"),
    check("aadhaar father from C/O", f.get("father_name", {}).get("value"), "Late Ravi Test"),
    check("aadhaar address ends at PIN", f.get("address", {}).get("value", "").endswith("560001"), True),
    check("aadhaar address has no masked number", "XXXX" in f.get("address", {}).get("value", ""), False),
    check("aadhaar number masked", f.get("aadhaar_number", {}).get("value", "").startswith("XXXX"), True),
]

# Form reader got the address as a "C/O" pair with the masked number stuck on the end.
kv = {"c/o": {"value": "Late Ravi Test, 12 Test Apartments, Test Nagar, Bengaluru, XXXX XXXX", "confidence": 0.9}}
f = handler._extract_aadhaar(kv, "")
handler._aadhaar_from_lines(f, [])
results += [
    check("pair address cleaned", "XXXX" in f["address"]["value"], False),
    check("pair father from label", f.get("father_name", {}).get("value"), "Late Ravi Test"),
]

# e-PAN: labels on their own lines, values on the next.
pan = blocks(
    "INCOME TAX DEPARTMENT",
    "GOVT. OF INDIA",
    "Permanent Account Number Card",
    "ABCDE1234F",
    "नाम / Name",
    "ASHA TEST",
    "पिता का नाम / Father's Name",
    "RAVI TEST",
    "जन्म की तारीख / Date of Birth",
    "02/06/1991",
)
f = handler._extract_pan({}, handler._get_all_text(pan))
handler._pan_from_lines(f, handler._lines(pan))
results += [
    check("pan number", f.get("pan_number", {}).get("value"), "ABCDE1234F"),
    check("pan name", f.get("name", {}).get("value"), "ASHA TEST"),
    check("pan father", f.get("father_name", {}).get("value"), "RAVI TEST"),
    check("pan dob", f.get("dob", {}).get("value"), "02/06/1991"),
]

print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
