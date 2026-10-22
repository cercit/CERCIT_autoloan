"""
Lambda: Cross-document validation (SCRUM-38)

Runs after all documents for an application are extracted.
Validates consistency across salary slip, Form 16, PAN, Aadhaar.
Writes validation report to Supabase.
"""

import json
import os
import re
import boto3

from shared.supabase_client import (
    get_extractions,
    can_see_customer_data,
    valid_application_id,
    write_validation_result,
)

s3 = boto3.client("s3")
BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")


def handler(event, context):
    """Can be invoked directly via API Gateway or as step function."""
    via_api = "httpMethod" in event
    if via_api and not can_see_customer_data(event):  # names and figures: not for the demo login (sql/050)
        return {"statusCode": 401, "body": "sign-in required"}
    try:
        body = json.loads(event.get("body") or "{}") if via_api else event
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": "body must be JSON"}
    if not isinstance(body, dict):
        return {"statusCode": 400, "body": "body must be a JSON object"}
    application_id = (
        body.get("application_id")
        or body.get("applicationId")
        or (event.get("pathParameters") or {}).get("applicationId")
    )

    if not valid_application_id(application_id):
        return {"statusCode": 400, "body": "valid application_id required"}

    extractions = get_extractions(application_id)
    if not extractions:
        return {"statusCode": 404, "body": "No extractions found"}

    docs = {e["doc_type"]: e.get("fields", {}) for e in extractions}
    checks = []

    checks.extend(_check_name_consistency(docs))
    checks.extend(_check_employer_match(docs))
    checks.extend(_check_pan_match(docs))
    checks.extend(_check_income_consistency(docs))
    checks.extend(_check_dob_consistency(docs))

    overall = "pass" if all(c["passed"] for c in checks) else "fail"

    result = {
        "application_id": application_id,
        "overall": overall,
        "checks": checks,
        "docs_validated": list(docs.keys()),
    }

    s3.put_object(
        Bucket=BUCKET,
        Key=f"extracted/{application_id}/validation_report.json",
        Body=json.dumps(result, indent=2),
        ContentType="application/json",
    )

    write_validation_result(application_id, checks)

    return {"statusCode": 200, "body": json.dumps(result)}


def _check_name_consistency(docs: dict) -> list[dict]:
    """Compare names across all document types."""
    names = {}
    for doc_type, fields in docs.items():
        name = fields.get("name", {}).get("value") or fields.get("employee_name", {}).get("value")
        if name:
            names[doc_type] = name

    if len(names) < 2:
        return []

    checks = []
    doc_types = list(names.keys())
    for i in range(len(doc_types)):
        for j in range(i + 1, len(doc_types)):
            a_type, b_type = doc_types[i], doc_types[j]
            sim = name_score(names[a_type], names[b_type])
            checks.append({
                "check": "name_consistency",
                "doc_a": a_type,
                "doc_b": b_type,
                "value_a": names[a_type],
                "value_b": names[b_type],
                "similarity": round(sim, 2),
                "passed": sim >= NAME_PASS,
            })

    return checks


def _check_employer_match(docs: dict) -> list[dict]:
    """Salary slip employer vs Form 16 employer."""
    slip_employer = docs.get("salary_slip", {}).get("employer_name", {}).get("value", "")
    f16_employer = docs.get("form16", {}).get("employer_name", {}).get("value", "")

    if not slip_employer or not f16_employer:
        return []

    sim = org_score(slip_employer, f16_employer)
    return [{
        "check": "employer_match",
        "doc_a": "salary_slip",
        "doc_b": "form16",
        "value_a": slip_employer,
        "value_b": f16_employer,
        "similarity": round(sim, 2),
        "passed": sim >= ORG_PASS,
    }]


def _check_pan_match(docs: dict) -> list[dict]:
    """PAN on Form 16 vs PAN card."""
    f16_pan = docs.get("form16", {}).get("pan", {}).get("value", "")
    card_pan = docs.get("pan_card", {}).get("pan_number", {}).get("value", "")

    if not f16_pan or not card_pan:
        return []

    clean_a = re.sub(r"\s", "", f16_pan.upper())
    clean_b = re.sub(r"\s", "", card_pan.upper())

    return [{
        "check": "pan_match",
        "doc_a": "form16",
        "doc_b": "pan_card",
        "value_a": clean_a,
        "value_b": clean_b,
        "passed": clean_a == clean_b,
    }]


def _check_income_consistency(docs: dict) -> list[dict]:
    """Monthly salary * 12 vs Form 16 annual income (10% tolerance)."""
    monthly = docs.get("salary_slip", {}).get("gross_salary", {}).get("value")
    annual = docs.get("form16", {}).get("gross_total_income", {}).get("value")

    if not monthly or not annual:
        return []

    if isinstance(monthly, str):
        monthly = int(re.sub(r"\D", "", monthly) or 0)
    if isinstance(annual, str):
        annual = int(re.sub(r"\D", "", annual) or 0)

    if annual == 0:
        return []

    projected_annual = monthly * 12
    ratio = projected_annual / annual if annual else 0
    within_tolerance = 0.9 <= ratio <= 1.1

    return [{
        "check": "income_consistency",
        "doc_a": "salary_slip",
        "doc_b": "form16",
        "monthly_salary": monthly,
        "projected_annual": projected_annual,
        "form16_annual": annual,
        "ratio": round(ratio, 3),
        "tolerance": "10%",
        "passed": within_tolerance,
    }]


def _check_dob_consistency(docs: dict) -> list[dict]:
    """DOB match across PAN and Aadhaar."""
    pan_dob = docs.get("pan_card", {}).get("dob", {}).get("value", "")
    aadhaar_dob = docs.get("aadhaar_card", {}).get("dob", {}).get("value", "")

    if not pan_dob or not aadhaar_dob:
        return []

    clean_a = _normalize_date(pan_dob)
    clean_b = _normalize_date(aadhaar_dob)

    return [{
        "check": "dob_match",
        "doc_a": "pan_card",
        "doc_b": "aadhaar_card",
        "value_a": pan_dob,
        "value_b": aadhaar_dob,
        "passed": clean_a == clean_b and clean_a != "",
    }]


def _normalize_date(raw: str) -> str:
    """Try to normalize date strings to YYYY-MM-DD."""
    raw = raw.strip()
    for fmt_re, reorder in [
        (r"(\d{2})[/\-.](\d{2})[/\-.](\d{4})", r"\3-\2-\1"),
        (r"(\d{4})[/\-.](\d{2})[/\-.](\d{2})", r"\1-\2-\3"),
    ]:
        m = re.match(fmt_re, raw)
        if m:
            return re.sub(fmt_re, reorder, raw)
    return raw


# --- name matching: the same rules as the database's fn_doc_name_score (sql/052, 090) ---

NAME_PASS = 0.80  # the document checks' bar; was 0.85 on a stricter score (22 Oct 2026)
_TITLES = {"mr", "mrs", "ms", "dr", "shri", "smt", "kumari", "late"}
_VARIANTS = {
    "mohammed": ("mohammed", "mohammad", "mohamed", "mohamad", "muhammad", "muhammed", "mohd", "md"),
    "lakshmi": ("lakshmi", "laxmi", "lakshmy", "laxmy"),
    "srinivas": ("srinivas", "srinivasa", "sreenivas", "sreenivasa", "shreenivas", "shrinivas", "shreenivasa", "shrinivasa"),
    "syed": ("syed", "sayed", "saiyed", "sayyed"),
    "shaikh": ("shaikh", "shaik", "sheikh", "shk"),
    "kumar": ("kumar", "kr"),
    "venkatesh": ("venkatesh", "venkatesha", "venkatesan"),
    "krishna": ("krishna", "krishnaa", "krisna"),
    "narayan": ("narayan", "narayana", "narayanan"),
    "subramanian": ("subramanian", "subramaniam", "subrahmanyam", "subramanyam"),
}
_CANON = {v: k for k, vs in _VARIANTS.items() for v in vs}


def name_words(name: str) -> list[str]:
    words = re.sub(r"[^a-z ]", " ", (name or "").lower()).split()
    return [_CANON.get(w, w) for w in words if w not in _TITLES]


def one_slip(a: str, b: str) -> bool:
    """Two words of 5+ letters that differ by one letter (changed, added or dropped)."""
    if a == b or min(len(a), len(b)) < 5 or abs(len(a) - len(b)) > 1:
        return False
    i = 0
    while i < min(len(a), len(b)) and a[i] == b[i]:
        i += 1
    if len(a) == len(b):
        return a[i + 1:] == b[i + 1:]
    return a[i + 1:] == b[i:] if len(a) > len(b) else a[i:] == b[i + 1:]


def name_score(p_a: str, p_b: str) -> float:
    """Share of the shorter name's words found in the longer one. An initial matches
    its word; one wrong letter in a 5+ letter word matches; at least one whole word must."""
    a, b = name_words(p_a), name_words(p_b)
    if not a or not b:
        return 0.0
    s, l = (a, b) if len(a) <= len(b) else (b, a)
    hit = whole = 0
    for w in s:
        if w in l:
            hit += 1
            whole += len(w) > 1
        elif len(w) >= 5 and any(one_slip(w, x) for x in l):
            hit += 1
            whole += 1
        elif any((len(w) == 1 and x[0] == w) or (len(x) == 1 and w[0] == x) for x in l):
            hit += 1
    return 0.0 if whole == 0 else round(hit / len(s), 2)


ORG_PASS = 0.60  # the document checks' employer bar (sql/052)
_ORG_WORDS = {"pvt", "private", "ltd", "limited", "llp", "inc", "the", "co", "company", "corp", "corporation", "india", "and"}


def org_score(p_a: str, p_b: str) -> float:
    """Employer names, as the database's fn_doc_org_score: drop the words every company name has."""
    keep = lambda n: " ".join(w for w in re.sub(r"[^a-z ]", " ", (n or "").lower()).split() if w not in _ORG_WORDS)
    return name_score(keep(p_a), keep(p_b))
