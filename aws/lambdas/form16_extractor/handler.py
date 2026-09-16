"""
Lambda: Form 16 extractor (SCRUM-34)

Triggered by S3 PUT on uploads/form16/.
Extracts PAN, employer, TAN, income, TDS from Form 16 Part B.
Cross-validates employer name against salary slip if available.
"""

import json
import os
import boto3

from shared.textract_parser import (
    parse_key_value_pairs,
    parse_tables,
    normalize_amount,
    fuzzy_field_match,
)
from shared.supabase_client import (
    upsert_extraction,
    update_application_fields,
    get_extractions,
)

textract = boto3.client("textract", region_name="ap-south-1")
s3 = boto3.client("s3")

BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")

FORM16_PATTERNS = {
    "pan": ["pan", "permanent account number"],
    "employer_name": ["name of the employer", "employer", "name and address of the employer"],
    "employer_tan": ["tan", "tax deduction account number", "tan of the deductor"],
    "employee_name": ["name of the employee", "employee name"],
    "assessment_year": ["assessment year"],
    "gross_total_income": [
        "gross total income",
        "income under the head salaries",
        "total income",
    ],
    "tds_deducted": [
        "tax deducted at source",
        "total tax deducted",
        "tds",
        "tax payable",
    ],
    "total_deductions": ["deductions under chapter vi-a", "aggregate of deductions"],
}


def handler(event, context):
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    application_id = _extract_application_id(key)
    if not application_id:
        return {"statusCode": 400, "body": "No application_id in S3 key"}

    response = textract.analyze_document(
        Document={"S3Object": {"Bucket": bucket, "Name": key}},
        FeatureTypes=["FORMS", "TABLES"],
    )

    blocks = response.get("Blocks", [])
    kv_pairs = parse_key_value_pairs(blocks)
    tables = parse_tables(blocks)

    fields = _extract_form16_fields(kv_pairs, tables)

    cross_check = _cross_validate_employer(application_id, fields)
    if cross_check:
        fields["_cross_validation"] = cross_check

    result = {
        "application_id": application_id,
        "source": "form16",
        "source_key": key,
        "fields": fields,
    }

    s3.put_object(
        Bucket=BUCKET,
        Key=f"extracted/{application_id}/form16.json",
        Body=json.dumps(result, indent=2),
        ContentType="application/json",
    )

    upsert_extraction(application_id, "form16", fields)

    return {"statusCode": 200, "body": json.dumps(result)}


def _extract_form16_fields(kv_pairs: dict, tables: list[list[dict]]) -> dict:
    fields: dict = {}

    for field_name, patterns in FORM16_PATTERNS.items():
        match = fuzzy_field_match(kv_pairs, patterns)
        if match:
            value = match["value"]
            confidence = match["confidence"]

            if field_name in ("gross_total_income", "tds_deducted", "total_deductions"):
                parsed = normalize_amount(value)
                if parsed is not None:
                    fields[field_name] = {"value": parsed, "confidence": confidence}
            else:
                fields[field_name] = {"value": value, "confidence": confidence}

    if "gross_total_income" not in fields:
        _try_income_from_tables(tables, fields)

    return fields


def _try_income_from_tables(tables: list[list[dict]], fields: dict):
    """Scan tables for income/TDS rows if key-value extraction missed them."""
    income_keywords = ["gross total income", "total income", "income chargeable"]
    tds_keywords = ["tax deducted", "total tax", "tds"]

    for table in tables:
        for row in table:
            if len(row) < 2:
                continue
            label = row[0]["text"].lower()
            val = row[-1]["text"]
            conf = min(row[0]["confidence"], row[-1]["confidence"])

            if "gross_total_income" not in fields:
                if any(k in label for k in income_keywords):
                    parsed = normalize_amount(val)
                    if parsed:
                        fields["gross_total_income"] = {
                            "value": parsed,
                            "confidence": conf,
                            "source": "table",
                        }

            if "tds_deducted" not in fields:
                if any(k in label for k in tds_keywords):
                    parsed = normalize_amount(val)
                    if parsed:
                        fields["tds_deducted"] = {
                            "value": parsed,
                            "confidence": conf,
                            "source": "table",
                        }


def _cross_validate_employer(application_id: str, form16_fields: dict) -> dict | None:
    """Compare employer name from Form 16 against salary slip extraction."""
    existing = get_extractions(application_id)
    salary_data = next(
        (e for e in existing if e.get("doc_type") == "salary_slip"), None
    )
    if not salary_data:
        return None

    salary_fields = salary_data.get("fields", {})
    salary_employer = salary_fields.get("employer_name", {}).get("value", "")
    form16_employer = form16_fields.get("employer_name", {}).get("value", "")

    if not salary_employer or not form16_employer:
        return None

    similarity = _simple_similarity(salary_employer.lower(), form16_employer.lower())

    return {
        "check": "employer_match",
        "salary_slip_value": salary_employer,
        "form16_value": form16_employer,
        "similarity": round(similarity, 2),
        "passed": similarity >= 0.85,
    }


def _simple_similarity(a: str, b: str) -> float:
    """Token overlap ratio. Good enough for employer name matching."""
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = tokens_a & tokens_b
    return len(overlap) / max(len(tokens_a), len(tokens_b))


def _extract_application_id(key: str) -> str | None:
    parts = key.split("/")
    return parts[2] if len(parts) >= 3 else None
