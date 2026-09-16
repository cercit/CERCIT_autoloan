"""
Lambda: KYC document extractor (SCRUM-35)

Handles PAN card and Aadhaar card extraction.
Aadhaar numbers are masked before storage (only last 4 digits kept).
Cross-validates name across PAN and Aadhaar.
"""

import json
import os
import re
import boto3

from shared.textract_parser import parse_key_value_pairs, fuzzy_field_match
from shared.supabase_client import upsert_extraction, get_extractions

textract = boto3.client("textract", region_name="ap-south-1")
s3 = boto3.client("s3")

BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")

PAN_PATTERNS = {
    "name": ["name"],
    "pan_number": ["permanent account number", "pan"],
    "father_name": ["father", "father's name"],
    "dob": ["date of birth", "dob", "birth"],
}

AADHAAR_PATTERNS = {
    "name": ["name"],
    "aadhaar_number": ["aadhaar", "uid", "enrollment"],
    "dob": ["date of birth", "dob", "birth", "year of birth"],
    "gender": ["gender", "male", "female"],
    "address": ["address", "s/o", "d/o", "w/o", "c/o"],
}


def handler(event, context):
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    application_id = _extract_application_id(key)
    if not application_id:
        return {"statusCode": 400, "body": "No application_id in S3 key"}

    doc_type = _detect_kyc_type(key)

    response = textract.analyze_document(
        Document={"S3Object": {"Bucket": bucket, "Name": key}},
        FeatureTypes=["FORMS"],
    )

    blocks = response.get("Blocks", [])
    kv_pairs = parse_key_value_pairs(blocks)
    raw_text = _get_all_text(blocks)

    if doc_type == "pan_card":
        fields = _extract_pan(kv_pairs, raw_text)
    else:
        fields = _extract_aadhaar(kv_pairs, raw_text)

    cross_check = _cross_validate_name(application_id, fields, doc_type)
    if cross_check:
        fields["_cross_validation"] = cross_check

    result = {
        "application_id": application_id,
        "source": doc_type,
        "source_key": key,
        "fields": fields,
    }

    s3.put_object(
        Bucket=BUCKET,
        Key=f"extracted/{application_id}/{doc_type}.json",
        Body=json.dumps(result, indent=2),
        ContentType="application/json",
    )

    upsert_extraction(application_id, doc_type, fields)

    return {"statusCode": 200, "body": json.dumps(result)}


def _extract_pan(kv_pairs: dict, raw_text: str) -> dict:
    fields: dict = {}

    for field_name, patterns in PAN_PATTERNS.items():
        match = fuzzy_field_match(kv_pairs, patterns)
        if match:
            fields[field_name] = {"value": match["value"], "confidence": match["confidence"]}

    if "pan_number" not in fields:
        pan_match = re.search(r"[A-Z]{5}\d{4}[A-Z]", raw_text)
        if pan_match:
            fields["pan_number"] = {
                "value": pan_match.group(),
                "confidence": 0.90,
                "source": "regex",
            }

    return fields


def _extract_aadhaar(kv_pairs: dict, raw_text: str) -> dict:
    fields: dict = {}

    for field_name, patterns in AADHAAR_PATTERNS.items():
        match = fuzzy_field_match(kv_pairs, patterns)
        if match:
            fields[field_name] = {"value": match["value"], "confidence": match["confidence"]}

    if "aadhaar_number" not in fields:
        aadhaar_match = re.search(r"\d{4}\s?\d{4}\s?\d{4}", raw_text)
        if aadhaar_match:
            raw_number = aadhaar_match.group().replace(" ", "")
            fields["aadhaar_number"] = {
                "value": _mask_aadhaar(raw_number),
                "confidence": 0.85,
                "source": "regex",
            }

    if "aadhaar_number" in fields:
        val = fields["aadhaar_number"]["value"]
        if not val.startswith("XXXX"):
            raw_digits = re.sub(r"\D", "", val)
            fields["aadhaar_number"]["value"] = _mask_aadhaar(raw_digits)

    return fields


def _mask_aadhaar(number: str) -> str:
    """Store only last 4 digits. Never persist full Aadhaar."""
    digits = re.sub(r"\D", "", number)
    if len(digits) >= 4:
        return f"XXXX-XXXX-{digits[-4:]}"
    return "XXXX-XXXX-XXXX"


def _get_all_text(blocks: list[dict]) -> str:
    """Concatenate all LINE text for regex fallback extraction."""
    lines = [b["Text"] for b in blocks if b.get("BlockType") == "LINE" and "Text" in b]
    return " ".join(lines)


def _cross_validate_name(application_id: str, current_fields: dict, current_type: str) -> dict | None:
    """Check name consistency across already-extracted KYC docs."""
    existing = get_extractions(application_id)
    current_name = current_fields.get("name", {}).get("value", "")
    if not current_name:
        return None

    checks = []
    for ext in existing:
        other_type = ext.get("doc_type", "")
        if other_type == current_type:
            continue
        other_name = ext.get("fields", {}).get("name", {}).get("value", "")
        if not other_name:
            other_name = ext.get("fields", {}).get("employee_name", {}).get("value", "")
        if not other_name:
            continue

        similarity = _token_similarity(current_name.lower(), other_name.lower())
        checks.append({
            "compared_with": other_type,
            "this_value": current_name,
            "other_value": other_name,
            "similarity": round(similarity, 2),
            "passed": similarity >= 0.85,
        })

    return checks if checks else None


def _token_similarity(a: str, b: str) -> float:
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = tokens_a & tokens_b
    return len(overlap) / max(len(tokens_a), len(tokens_b))


def _detect_kyc_type(key: str) -> str:
    lower = key.lower()
    if "pan" in lower:
        return "pan_card"
    return "aadhaar_card"


def _extract_application_id(key: str) -> str | None:
    parts = key.split("/")
    return parts[2] if len(parts) >= 3 else None
