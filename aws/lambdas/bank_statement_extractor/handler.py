"""
Lambda: Bank statement extractor

Triggered by S3 PUT on uploads/bank-statements/.
Uses Textract StartDocumentAnalysis (async) for multi-page PDF support.
Extracts transactions, categorizes them, computes cash flow metrics,
writes results to S3 and Supabase.
"""

import json
import os
import time
import re
from datetime import datetime

import boto3

from shared.textract_parser import parse_tables, normalize_amount
from shared.supabase_client import (
    upsert_extraction,
    upsert_bank_analysis,
    insert_bank_transactions,
)

textract = boto3.client("textract", region_name="ap-south-1")
s3 = boto3.client("s3")

BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")

CATEGORY_KEYWORDS = {
    "Salary": [
        "salary", "sal credit", "payroll", "wages", "monthly pay",
        "neft cr", "rtgs cr",
    ],
    "EMI": [
        "emi", "loan", "equated monthly", "auto debit", "nach",
        "mandate", "hdfc ltd", "bajaj fin", "tata capital",
        "icici bank emi", "sbi card emi",
    ],
    "UPI": [
        "upi", "phonepe", "gpay", "google pay", "paytm", "bhim",
    ],
    "Rent": [
        "rent", "house rent", "landlord",
    ],
    "Utilities": [
        "electricity", "water bill", "gas bill", "broadband",
        "internet", "mobile recharge", "airtel", "jio", "bsnl",
        "bescom", "cesc",
    ],
    "Insurance": [
        "insurance", "lic", "premium", "policy",
    ],
    "Investment": [
        "mutual fund", "sip", "mf purchase", "investment",
        "zerodha", "groww", "kuvera",
    ],
    "Bounce": [
        "bounce", "return", "unpaid", "dishonour", "insufficient",
        "ecs return", "nach return",
    ],
    "Cash": [
        "atm", "cash withdrawal", "cash deposit", "cdm",
        "self withdrawal",
    ],
    "Transfer": [
        "transfer", "neft", "rtgs", "imps", "fund transfer",
    ],
}


def handler(event, context):
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    application_id = _extract_application_id(key)
    if not application_id:
        return {"statusCode": 400, "body": "No application_id in S3 key"}

    blocks = _run_textract(bucket, key)
    tables = parse_tables(blocks)
    transactions = _extract_transactions(tables)
    categorized = _categorize_transactions(transactions)
    summary = _compute_cashflow(categorized)

    result = {
        "application_id": application_id,
        "source": "bank_statement",
        "source_key": key,
        "fields": _summary_to_fields(summary),
        "summary": summary,
        "transaction_count": len(categorized),
    }

    s3.put_object(
        Bucket=BUCKET,
        Key=f"extracted/{application_id}/bank_statement.json",
        Body=json.dumps(result, indent=2, default=str),
        ContentType="application/json",
    )

    txn_file = {
        "application_id": application_id,
        "transactions": categorized,
    }
    s3.put_object(
        Bucket=BUCKET,
        Key=f"extracted/{application_id}/bank_transactions.json",
        Body=json.dumps(txn_file, indent=2, default=str),
        ContentType="application/json",
    )

    upsert_extraction(application_id, "bank_statement", _summary_to_fields(summary))
    upsert_bank_analysis(application_id, summary)
    if categorized:
        insert_bank_transactions(application_id, categorized)

    return {"statusCode": 200, "body": json.dumps(result, default=str)}


def _run_textract(bucket: str, key: str) -> list[dict]:
    """Run Textract on the document. Uses async API for multi-page PDF support."""
    obj = s3.head_object(Bucket=bucket, Key=key)
    content_type = obj.get("ContentType", "application/pdf")
    size = obj.get("ContentLength", 0)

    if content_type in ("image/jpeg", "image/png") or size < 5_000_000:
        try:
            response = textract.analyze_document(
                Document={"S3Object": {"Bucket": bucket, "Name": key}},
                FeatureTypes=["TABLES"],
            )
            return response.get("Blocks", [])
        except textract.exceptions.UnsupportedDocumentException:
            pass

    job_response = textract.start_document_analysis(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}},
        FeatureTypes=["TABLES"],
    )
    job_id = job_response["JobId"]

    for _ in range(30):
        time.sleep(3)
        result = textract.get_document_analysis(JobId=job_id)
        status = result["JobStatus"]
        if status == "SUCCEEDED":
            blocks = result.get("Blocks", [])
            next_token = result.get("NextToken")
            while next_token:
                more = textract.get_document_analysis(
                    JobId=job_id, NextToken=next_token
                )
                blocks.extend(more.get("Blocks", []))
                next_token = more.get("NextToken")
            return blocks
        if status == "FAILED":
            raise RuntimeError(f"Textract job {job_id} failed: {result.get('StatusMessage')}")

    raise TimeoutError(f"Textract job {job_id} did not complete within 90 seconds")


def _extract_transactions(tables: list[list[dict]]) -> list[dict]:
    """Parse table rows into transaction objects."""
    transactions: list[dict] = []

    for table in tables:
        if not table:
            continue

        header_row = table[0]
        col_map = _detect_columns(header_row)
        if not col_map:
            continue

        for row in table[1:]:
            if len(row) < 3:
                continue

            txn = _parse_transaction_row(row, col_map)
            if txn:
                transactions.append(txn)

    transactions.sort(key=lambda t: t.get("date", ""))
    return transactions


def _detect_columns(header_row: list[dict]) -> dict[str, int] | None:
    """Identify which column index maps to date, description, debit, credit, balance."""
    col_map: dict[str, int] = {}
    for i, cell in enumerate(header_row):
        text = cell["text"].lower().strip()
        if any(w in text for w in ("date", "txn date", "value date", "trans date")):
            col_map["date"] = i
        elif any(w in text for w in ("narration", "description", "particulars", "details", "remarks")):
            col_map["description"] = i
        elif any(w in text for w in ("withdrawal", "debit", "dr")):
            col_map["debit"] = i
        elif any(w in text for w in ("deposit", "credit", "cr")):
            col_map["credit"] = i
        elif any(w in text for w in ("balance", "closing", "running")):
            col_map["balance"] = i

    if "date" in col_map and "description" in col_map:
        return col_map
    return None


def _parse_transaction_row(row: list[dict], col_map: dict[str, int]) -> dict | None:
    """Convert a table row into a transaction dict."""
    date_idx = col_map.get("date", 0)
    desc_idx = col_map.get("description", 1)
    debit_idx = col_map.get("debit")
    credit_idx = col_map.get("credit")
    balance_idx = col_map.get("balance")

    if date_idx >= len(row) or desc_idx >= len(row):
        return None

    date_text = row[date_idx]["text"].strip()
    parsed_date = _parse_date(date_text)
    if not parsed_date:
        return None

    description = row[desc_idx]["text"].strip()
    if not description or len(description) < 3:
        return None

    debit = 0
    credit = 0
    balance = 0

    if debit_idx is not None and debit_idx < len(row):
        debit = normalize_amount(row[debit_idx]["text"]) or 0
    if credit_idx is not None and credit_idx < len(row):
        credit = normalize_amount(row[credit_idx]["text"]) or 0
    if balance_idx is not None and balance_idx < len(row):
        balance = normalize_amount(row[balance_idx]["text"]) or 0

    if debit == 0 and credit == 0:
        return None

    return {
        "date": parsed_date,
        "description": description,
        "debit": debit,
        "credit": credit,
        "balance": balance,
    }


def _parse_date(text: str) -> str | None:
    """Try to parse a date string into YYYY-MM-DD format."""
    formats = [
        "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d-%b-%Y",
        "%d/%m/%y", "%d-%m-%y", "%d %b %y", "%d-%b-%y",
        "%Y-%m-%d",
    ]
    cleaned = text.strip().split()[0] if text.strip() else ""
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            if dt.year < 100:
                dt = dt.replace(year=dt.year + 2000)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _categorize_transactions(transactions: list[dict]) -> list[dict]:
    """Add category field to each transaction."""
    for txn in transactions:
        txn["category"] = _categorize(txn["description"])
    return transactions


def _categorize(description: str) -> str:
    """Match transaction description to a category using keyword rules."""
    desc_lower = description.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in desc_lower:
                if category == "Transfer" and any(
                    sal_kw in desc_lower for sal_kw in CATEGORY_KEYWORDS["Salary"]
                ):
                    return "Salary"
                return category
    return "Other"


def _compute_cashflow(transactions: list[dict]) -> dict:
    """Compute cash flow metrics from categorized transactions."""
    if not transactions:
        return _empty_summary()

    dates = [t["date"] for t in transactions if t.get("date")]
    if not dates:
        return _empty_summary()

    months_set = {d[:7] for d in dates}
    month_count = max(len(months_set), 1)

    total_credits = sum(t["credit"] for t in transactions)
    total_debits = sum(t["debit"] for t in transactions)

    salary_txns = [t for t in transactions if t["category"] == "Salary"]
    salary_credits = [t["credit"] for t in salary_txns if t["credit"] > 0]
    salary_count = len(salary_credits)
    avg_salary = int(sum(salary_credits) / len(salary_credits)) if salary_credits else 0

    emi_txns = [t for t in transactions if t["category"] == "EMI"]
    emi_count = len(emi_txns)
    emi_total = sum(t["debit"] for t in emi_txns)

    bounce_txns = [t for t in transactions if t["category"] == "Bounce"]
    bounce_outward = sum(1 for t in bounce_txns if t["debit"] > 0)
    bounce_inward = sum(1 for t in bounce_txns if t["credit"] > 0)

    cash_txns = [t for t in transactions if t["category"] == "Cash"]
    cash_deposits = sum(t["credit"] for t in cash_txns)

    balances = [t["balance"] for t in transactions if t["balance"] > 0]
    avg_balance = int(sum(balances) / len(balances)) if balances else 0

    min_balance_threshold = 10000
    min_balance_breaches = sum(1 for b in balances if b < min_balance_threshold)

    return {
        "avg_monthly_balance": avg_balance,
        "salary_credit_count": salary_count,
        "avg_salary_amount": avg_salary,
        "emi_debit_count": emi_count,
        "emi_debit_total": emi_total,
        "cash_deposits": cash_deposits,
        "cheque_bounce_inward": bounce_inward,
        "cheque_bounce_outward": bounce_outward,
        "min_balance_breaches": min_balance_breaches,
        "months": month_count,
        "total_credits": total_credits,
        "total_debits": total_debits,
    }


def _empty_summary() -> dict:
    return {
        "avg_monthly_balance": 0,
        "salary_credit_count": 0,
        "avg_salary_amount": 0,
        "emi_debit_count": 0,
        "emi_debit_total": 0,
        "cash_deposits": 0,
        "cheque_bounce_inward": 0,
        "cheque_bounce_outward": 0,
        "min_balance_breaches": 0,
        "months": 0,
        "total_credits": 0,
        "total_debits": 0,
    }


def _summary_to_fields(summary: dict) -> dict:
    """Convert summary into the extraction fields format for consistency."""
    return {
        "avg_monthly_balance": {"value": summary["avg_monthly_balance"], "confidence": 0.85},
        "avg_salary": {"value": summary["avg_salary_amount"], "confidence": 0.8},
        "salary_count": {"value": summary["salary_credit_count"], "confidence": 0.85},
        "emi_count": {"value": summary["emi_debit_count"], "confidence": 0.8},
        "emi_total": {"value": summary["emi_debit_total"], "confidence": 0.8},
        "bounce_count": {"value": summary["cheque_bounce_outward"], "confidence": 0.9},
        "months_analyzed": {"value": summary["months"], "confidence": 1.0},
    }


def _extract_application_id(key: str) -> str | None:
    parts = key.split("/")
    if len(parts) >= 3:
        return parts[2]
    return None
