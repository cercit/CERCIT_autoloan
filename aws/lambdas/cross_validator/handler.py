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

from shared.supabase_client import get_extractions, write_validation_result

s3 = boto3.client("s3")
BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")


def handler(event, context):
    """Can be invoked directly via API Gateway or as step function."""
    body = json.loads(event.get("body", "{}")) if isinstance(event.get("body"), str) else event
    application_id = body.get("application_id")

    if not application_id:
        return {"statusCode": 400, "body": "application_id required"}

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
            sim = _token_similarity(names[a_type].lower(), names[b_type].lower())
            checks.append({
                "check": "name_consistency",
                "doc_a": a_type,
                "doc_b": b_type,
                "value_a": names[a_type],
                "value_b": names[b_type],
                "similarity": round(sim, 2),
                "passed": sim >= 0.85,
            })

    return checks


def _check_employer_match(docs: dict) -> list[dict]:
    """Salary slip employer vs Form 16 employer."""
    slip_employer = docs.get("salary_slip", {}).get("employer_name", {}).get("value", "")
    f16_employer = docs.get("form16", {}).get("employer_name", {}).get("value", "")

    if not slip_employer or not f16_employer:
        return []

    sim = _token_similarity(slip_employer.lower(), f16_employer.lower())
    return [{
        "check": "employer_match",
        "doc_a": "salary_slip",
        "doc_b": "form16",
        "value_a": slip_employer,
        "value_b": f16_employer,
        "similarity": round(sim, 2),
        "passed": sim >= 0.85,
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


def _token_similarity(a: str, b: str) -> float:
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = tokens_a & tokens_b
    return len(overlap) / max(len(tokens_a), len(tokens_b))
