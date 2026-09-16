"""
Lambda: Salary slip extractor (SCRUM-33)

Triggered by S3 PUT on uploads/salary-slips/.
Calls Textract AnalyzeDocument, extracts salary fields,
writes structured JSON to S3 and Supabase.
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
from shared.supabase_client import upsert_extraction, update_application_fields

textract = boto3.client("textract", region_name="ap-south-1")
s3 = boto3.client("s3")

BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")

SALARY_PATTERNS = {
    "employer_name": ["employer", "company name", "organisation", "organization"],
    "employee_name": ["employee name", "name of employee", "employee"],
    "gross_salary": ["gross salary", "gross pay", "gross earning", "total earning"],
    "net_salary": ["net salary", "net pay", "take home", "net amount"],
    "basic_salary": ["basic", "basic pay", "basic salary"],
    "hra": ["hra", "house rent"],
    "pf_deduction": ["provident fund", "pf", "epf"],
    "esi_deduction": ["esi", "esic"],
    "tds_deduction": ["tds", "income tax", "tax deducted"],
    "professional_tax": ["professional tax", "pt", "prof tax"],
    "pay_period": ["pay period", "month", "salary month", "period", "for the month"],
}


def handler(event, context):
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    application_id = _extract_application_id(key)
    if not application_id:
        return {"statusCode": 400, "body": "No application_id in S3 key metadata"}

    response = textract.analyze_document(
        Document={"S3Object": {"Bucket": bucket, "Name": key}},
        FeatureTypes=["FORMS", "TABLES"],
    )

    blocks = response.get("Blocks", [])
    kv_pairs = parse_key_value_pairs(blocks)
    tables = parse_tables(blocks)

    fields = _extract_salary_fields(kv_pairs, tables)

    result = {
        "application_id": application_id,
        "source": "salary_slip",
        "source_key": key,
        "fields": fields,
    }

    s3.put_object(
        Bucket=BUCKET,
        Key=f"extracted/{application_id}/salary_slip.json",
        Body=json.dumps(result, indent=2),
        ContentType="application/json",
    )

    upsert_extraction(application_id, "salary_slip", fields)

    app_updates = {}
    if fields.get("employer_name", {}).get("confidence", 0) > 0.7:
        app_updates["employer_name"] = fields["employer_name"]["value"]
    if fields.get("net_salary", {}).get("confidence", 0) > 0.7:
        app_updates["declared_net_salary"] = fields["net_salary"]["value"]
    if app_updates:
        update_application_fields(application_id, app_updates)

    return {"statusCode": 200, "body": json.dumps(result)}


def _extract_salary_fields(
    kv_pairs: dict, tables: list[list[dict]]
) -> dict:
    """Map Textract key-value pairs to salary slip schema."""
    fields: dict = {}

    for field_name, patterns in SALARY_PATTERNS.items():
        match = fuzzy_field_match(kv_pairs, patterns)
        if match:
            value = match["value"]
            confidence = match["confidence"]

            if field_name in (
                "gross_salary", "net_salary", "basic_salary", "hra",
                "pf_deduction", "esi_deduction", "tds_deduction", "professional_tax",
            ):
                parsed = normalize_amount(value)
                if parsed is not None:
                    fields[field_name] = {"value": parsed, "confidence": confidence}
            else:
                fields[field_name] = {"value": value, "confidence": confidence}

    if "gross_salary" not in fields or "net_salary" not in fields:
        _try_extract_from_tables(tables, fields)

    if "gross_salary" in fields and "net_salary" not in fields:
        gross = fields["gross_salary"]["value"]
        total_ded = sum(
            fields.get(d, {}).get("value", 0)
            for d in ("pf_deduction", "esi_deduction", "tds_deduction", "professional_tax")
        )
        if total_ded > 0:
            fields["net_salary"] = {
                "value": gross - total_ded,
                "confidence": 0.75,
                "derived": True,
            }

    return fields


def _try_extract_from_tables(tables: list[list[dict]], fields: dict):
    """Fallback: scan table rows for salary/deduction amounts."""
    for table in tables:
        for row in table:
            if len(row) < 2:
                continue
            label = row[0]["text"].lower()
            value_text = row[-1]["text"]
            conf = min(row[0]["confidence"], row[-1]["confidence"])

            for field_name, patterns in SALARY_PATTERNS.items():
                if field_name in fields:
                    continue
                if any(p in label for p in patterns):
                    parsed = normalize_amount(value_text)
                    if parsed is not None:
                        fields[field_name] = {
                            "value": parsed,
                            "confidence": conf,
                            "source": "table",
                        }
                        break


def _extract_application_id(key: str) -> str | None:
    """
    Expect key format: uploads/salary-slips/{application_id}/{filename}
    Or get it from S3 object metadata.
    """
    parts = key.split("/")
    if len(parts) >= 3:
        return parts[2]
    return None
