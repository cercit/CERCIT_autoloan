"""
Lightweight Supabase REST client for Lambda functions.
Uses only urllib (no external deps) to keep Lambda package small.
"""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# IDs are interpolated into PostgREST filters and S3 keys, so only these shapes are accepted.
# Real application numbers are YYYYMM + 6 digits (fn_generate_application_id, 004); APP-... are the samples.
_APP_ID_RE = re.compile(
    r"^(APP-\d{4}-\d{5}|\d{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"
)


def valid_application_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_APP_ID_RE.match(value))


def is_staff_request(event: dict) -> bool:
    """True only if the caller sent a Supabase session token belonging to active staff."""
    headers = event.get("headers") or {}
    auth = next((v for k, v in headers.items() if k.lower() == "authorization"), "")
    if not auth.lower().startswith("bearer "):
        return False
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/fn_current_staff_id",
        data=b"{}",
        method="POST",
        headers={"apikey": SUPABASE_KEY, "Authorization": auth, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read() or "null") is not None
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError):
        return False


def _bearer(event: dict) -> str:
    headers = event.get("headers") or {}
    auth = next((v for k, v in headers.items() if k.lower() == "authorization"), "")
    return auth if auth.lower().startswith("bearer ") else ""


def customer_can_upload(event: dict, application_id: str) -> bool:
    """True only if the caller's own sign-in token owns this draft application (sql/044)."""
    auth = _bearer(event)
    if not auth:
        return False
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/fn_customer_can_upload",
        data=json.dumps({"p_application_id": application_id}).encode(),
        method="POST",
        headers={"apikey": SUPABASE_KEY, "Authorization": auth, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read() or "false") is True
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError):
        return False


def customer_register_document(event: dict, params: dict) -> tuple[bool, Any]:
    """Registers a finalised upload as the customer themself (sql/045), so the database's
    ownership and folder checks run exactly as they would from the browser."""
    auth = _bearer(event)
    if not auth:
        return False, "sign-in required"
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/fn_customer_register_document",
        data=json.dumps(params).encode(),
        method="POST",
        headers={"apikey": SUPABASE_KEY, "Authorization": auth, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return True, json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read() or b"{}").get("message") or "The file could not be saved."
        except ValueError:
            msg = "The file could not be saved."
        return False, msg[:1].upper() + msg[1:]
    except (urllib.error.URLError, ValueError):
        return False, "The file could not be saved. Try again."


def record_face_match(application_id: str, doc_type: str, side: str, similarity: float | None, result: str) -> None:
    """Face match result from the upload service (sql/046; service key only)."""
    _post("/rest/v1/rpc/fn_record_face_match", {
        "p_application_id": application_id, "p_doc_type": doc_type, "p_side": side,
        "p_similarity": similarity, "p_result": result,
    })


def resume_lookup(mobile: str) -> dict | None:
    """The newest draft application for this mobile, or None (sql/046; service key only)."""
    out = _post("/rest/v1/rpc/fn_customer_resume_lookup", {"p_mobile": mobile})
    return out if isinstance(out, dict) and out.get("email") else None


def send_continue_link(email: str, redirect_to: str) -> bool:
    """Emails the customer a sign-in link (Supabase "Magic Link" template). Never creates a login."""
    url = f"{SUPABASE_URL}/auth/v1/otp?redirect_to={urllib.parse.quote(redirect_to, safe='')}"
    req = urllib.request.Request(
        url,
        data=json.dumps({"email": email, "create_user": False}).encode(),
        method="POST",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except urllib.error.HTTPError as e:
        return e.code == 429  # one email a minute: the earlier link is still on its way
    except urllib.error.URLError:
        return False


def can_see_customer_data(event: dict) -> bool:
    """Staff allowed to see real customers' personal data (sql/050: pii.reveal).
    The shared demo login is staff but is not allowed."""
    auth = _bearer(event)
    if not auth:
        return False
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/fn_sees_real_customers",
        data=b"{}",
        method="POST",
        headers={"apikey": SUPABASE_KEY, "Authorization": auth, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read() or "false") is True
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError):
        return False


def _headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def upsert_extraction(application_id: str, doc_type: str, fields: dict) -> dict:
    """Saves what a reader found (sql/052, fixes R20). The database then re-runs the
    automatic document checks for a submitted application. doc_type is the reader
    type: pan_card, aadhaar_card, salary_slip, form16 or bank_statement."""
    return _post("/rest/v1/rpc/fn_record_document_reading", {
        "p_application_id": application_id,
        "p_reader_type": doc_type,
        "p_fields": fields,
    })


def update_application_fields(application_id: str, updates: dict) -> dict:
    """Patch application row with extracted values."""
    url = f"/rest/v1/applications?application_id=eq.{application_id}"
    return _patch(url, updates)


def write_validation_result(application_id: str, checks: list[dict]) -> dict:
    """Write cross-document validation results."""
    payload = {
        "application_id": application_id,
        "checks": checks,
        "status": "validated",
    }
    return _post("/rest/v1/document_validations", payload)


def _post(path: str, data: dict | list) -> dict | list:
    return _request("POST", path, data)


def _patch(path: str, data: dict) -> dict:
    return _request("PATCH", path, data)


def _request(method: str, path: str, data: dict | list) -> dict | list:
    url = f"{SUPABASE_URL}{path}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=_headers(), method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        return {"error": e.code, "message": error_body}


def upsert_bank_analysis(application_id: str, summary: dict) -> dict:
    """Write bank statement analysis summary."""
    payload = {
        "application_id": application_id,
        "avg_monthly_balance": summary.get("avg_monthly_balance", 0),
        "salary_credit_count": summary.get("salary_credit_count", 0),
        "avg_salary_amount": summary.get("avg_salary_amount", 0),
        "emi_debit_count": summary.get("emi_debit_count", 0),
        "emi_debit_total": summary.get("emi_debit_total", 0),
        "cash_deposits": summary.get("cash_deposits", 0),
        "cheque_bounce_inward": summary.get("cheque_bounce_inward", 0),
        "cheque_bounce_outward": summary.get("cheque_bounce_outward", 0),
        "min_balance_breaches": summary.get("min_balance_breaches", 0),
        "months": summary.get("months", 0),
    }
    return _post("/rest/v1/bank_statement_analysis", payload)


def insert_bank_transactions(application_id: str, transactions: list[dict]) -> dict:
    """Write categorized bank transactions."""
    rows = []
    for txn in transactions:
        rows.append({
            "application_id": application_id,
            "transaction_date": txn.get("date"),
            "description": txn.get("description", ""),
            "debit": txn.get("debit", 0),
            "credit": txn.get("credit", 0),
            "balance": txn.get("balance", 0),
            "category": txn.get("category", "Other"),
        })
    if not rows:
        return {}
    return _post("/rest/v1/bank_transactions", rows)


def upsert_bureau_report(application_id: str, report: dict) -> dict:
    payload = {
        "application_id": application_id,
        "bureau_name": report.get("bureau_name", "CIBIL"),
        "score": report.get("score", 0),
        "dpd_30": report.get("dpd_30", 0),
        "dpd_60": report.get("dpd_60", 0),
        "dpd_90": report.get("dpd_90", 0),
        "active_accounts": report.get("active_accounts", 0),
        "total_accounts": report.get("total_accounts", 0),
        "total_outstanding": report.get("total_outstanding", 0),
        "total_credit_limit": report.get("total_credit_limit", 0),
        "enquiries_90d": report.get("enquiries_90d", 0),
        "pan": report.get("pan", ""),
        "report_date": report.get("report_date", ""),
    }
    return _post("/rest/v1/bureau_reports", payload)


def get_extractions(application_id: str) -> list[dict]:
    """Fetch all extractions for an application."""
    url = f"{SUPABASE_URL}/rest/v1/document_extractions?application_id=eq.{application_id}"
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())
