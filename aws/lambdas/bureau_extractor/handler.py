"""
Lambda: Bureau (CIBIL/Experian) report extractor

Triggered by S3 PUT on uploads/bureau/.
Calls Textract AnalyzeDocument, extracts credit bureau fields,
writes structured JSON to S3 and Supabase.
"""

import json
import os
import re

import boto3

from shared.textract_parser import parse_key_value_pairs, parse_tables, normalize_amount, fuzzy_field_match
from shared.supabase_client import upsert_extraction, upsert_bureau_report

textract = boto3.client("textract", region_name="ap-south-1")
s3 = boto3.client("s3")

BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")

SCORE_PATTERNS = [
    "cibil score", "cibil transunion score", "credit score",
    "experian score", "crif score", "score",
]

FIELD_PATTERNS = {
    "pan": ["pan", "permanent account number", "pan number", "pan no"],
    "name": ["name", "consumer name", "applicant name", "member name"],
    "report_date": ["date of report", "report date", "date of issue", "generated on", "report generated"],
    "dob": ["date of birth", "dob", "birth date"],
    "total_accounts": ["total accounts", "no. of accounts", "number of accounts", "total no of accounts"],
    "active_accounts": ["active accounts", "open accounts", "current accounts", "live accounts"],
    "closed_accounts": ["closed accounts"],
    "overdue_accounts": ["overdue accounts", "delinquent accounts"],
    "total_outstanding": ["total outstanding", "outstanding balance", "current balance", "total balance"],
    "total_credit_limit": ["total credit limit", "sanctioned amount", "credit limit"],
    "enquiry_count": ["enquiries", "total enquiries", "no. of enquiries", "number of enquiries"],
    "oldest_account": ["oldest account", "first account opened", "oldest trade"],
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
    full_text = _extract_full_text(blocks)

    fields = _extract_bureau_fields(kv_pairs, tables, full_text)
    dpd = _extract_dpd_from_tables(tables)
    enquiries = _extract_enquiry_count(kv_pairs, full_text)
    bureau_name = _detect_bureau(full_text)

    score = fields.get("score", {}).get("value", 0)

    report = {
        "application_id": application_id,
        "bureau_name": bureau_name,
        "score": score,
        "dpd_30": dpd.get("dpd_30", 0),
        "dpd_60": dpd.get("dpd_60", 0),
        "dpd_90": dpd.get("dpd_90", 0),
        "active_accounts": fields.get("active_accounts", {}).get("value", 0),
        "total_accounts": fields.get("total_accounts", {}).get("value", 0),
        "total_outstanding": fields.get("total_outstanding", {}).get("value", 0),
        "total_credit_limit": fields.get("total_credit_limit", {}).get("value", 0),
        "enquiries_90d": enquiries,
        "pan": fields.get("pan", {}).get("value", ""),
        "report_date": fields.get("report_date", {}).get("value", ""),
    }

    result = {
        "application_id": application_id,
        "source": "bureau_report",
        "source_key": key,
        "fields": fields,
        "report": report,
        "dpd": dpd,
    }

    s3.put_object(
        Bucket=BUCKET,
        Key=f"extracted/{application_id}/bureau_report.json",
        Body=json.dumps(result, indent=2, default=str),
        ContentType="application/json",
    )

    upsert_extraction(application_id, "bureau_report", fields)
    upsert_bureau_report(application_id, report)

    return {"statusCode": 200, "body": json.dumps(result, default=str)}


def _extract_bureau_fields(kv_pairs: dict, tables: list, full_text: str) -> dict:
    fields: dict = {}

    score = _extract_score(kv_pairs, full_text)
    if score:
        fields["score"] = score

    for field_name, patterns in FIELD_PATTERNS.items():
        match = fuzzy_field_match(kv_pairs, patterns)
        if match:
            value = match["value"]
            confidence = match["confidence"]

            if field_name in ("total_accounts", "active_accounts", "closed_accounts",
                              "overdue_accounts", "enquiry_count"):
                parsed = _parse_int(value)
                if parsed is not None:
                    fields[field_name] = {"value": parsed, "confidence": confidence}
            elif field_name in ("total_outstanding", "total_credit_limit"):
                parsed = normalize_amount(value)
                if parsed is not None:
                    fields[field_name] = {"value": parsed, "confidence": confidence}
            else:
                fields[field_name] = {"value": value, "confidence": confidence}

    return fields


def _extract_score(kv_pairs: dict, full_text: str) -> dict | None:
    for pattern in SCORE_PATTERNS:
        match = fuzzy_field_match(kv_pairs, [pattern])
        if match:
            score = _parse_int(match["value"])
            if score and 300 <= score <= 900:
                return {"value": score, "confidence": match["confidence"]}

    score_match = re.search(r'(?:score|cibil|experian|crif)\s*[:=]?\s*(\d{3})', full_text.lower())
    if score_match:
        score = int(score_match.group(1))
        if 300 <= score <= 900:
            return {"value": score, "confidence": 0.7}

    three_digit = re.findall(r'\b(\d{3})\b', full_text)
    for num_str in three_digit:
        num = int(num_str)
        if 550 <= num <= 900:
            return {"value": num, "confidence": 0.5}

    return None


def _extract_dpd_from_tables(tables: list) -> dict:
    dpd = {"dpd_30": 0, "dpd_60": 0, "dpd_90": 0}

    for table in tables:
        for row in table:
            if len(row) < 2:
                continue
            label = row[0]["text"].lower()
            for cell in row[1:]:
                text = cell["text"].strip().upper()
                if "STD" in text or text == "000":
                    continue
                if any(k in label for k in ("dpd", "days past due", "overdue", "status")):
                    val = _parse_int(text)
                    if val and val > 0:
                        if val <= 30:
                            dpd["dpd_30"] += 1
                        elif val <= 60:
                            dpd["dpd_60"] += 1
                        else:
                            dpd["dpd_90"] += 1

    return dpd


def _extract_enquiry_count(kv_pairs: dict, full_text: str) -> int:
    match = fuzzy_field_match(kv_pairs, ["enquiries", "total enquiries", "no. of enquiries"])
    if match:
        val = _parse_int(match["value"])
        if val is not None:
            return val

    enq_match = re.search(r'(?:enquir|inquir)\w*\s*[:=]?\s*(\d+)', full_text.lower())
    if enq_match:
        return int(enq_match.group(1))

    return 0


def _detect_bureau(full_text: str) -> str:
    lower = full_text.lower()
    if "cibil" in lower or "transunion" in lower:
        return "CIBIL"
    if "experian" in lower:
        return "Experian"
    if "crif" in lower or "highmark" in lower:
        return "CRIF"
    return "CIBIL"


def _extract_full_text(blocks: list[dict]) -> str:
    lines = []
    for block in blocks:
        if block.get("BlockType") == "LINE":
            lines.append(block.get("Text", ""))
    return " ".join(lines)


def _parse_int(text: str) -> int | None:
    cleaned = re.sub(r"[^\d]", "", text)
    if not cleaned:
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def _extract_application_id(key: str) -> str | None:
    parts = key.split("/")
    if len(parts) >= 3:
        return parts[2]
    return None
