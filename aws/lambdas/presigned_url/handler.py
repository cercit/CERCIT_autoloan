"""
Lambda: Presigned URL generator (SCRUM-36)

Returns a presigned S3 PUT URL so the browser can upload
documents directly to S3 without going through API Gateway
(avoids the 10MB payload limit).
"""

import json
import os
import re
import uuid
import boto3
from botocore.config import Config

from shared.supabase_client import (
    customer_can_upload,
    is_staff_request,
    resume_lookup,
    send_continue_link,
    valid_application_id,
)

s3 = boto3.client(
    "s3",
    region_name="ap-south-1",
    config=Config(s3={"addressing_style": "virtual"}),
    endpoint_url="https://s3.ap-south-1.amazonaws.com",
)
BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")

# Must match document_types.upload_type / storage_folder (sql/044). The first five
# folders trigger the document readers; "uploads/other/*" is stored only.
DOC_TYPE_FOLDERS = {
    "salary_slip": "uploads/salary-slips",
    "form16": "uploads/form16",
    "bank_statement": "uploads/bank-statements",
    "pan_card": "uploads/kyc",
    "aadhaar_card": "uploads/kyc",
    "quote": "uploads/other/quote",
    "eb_bill": "uploads/other/eb-bill",
    "company_id": "uploads/other/company-id",
    "live_photo": "uploads/other/live-photo",
    "itr": "uploads/other/itr",
}

ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/tiff"}
MAX_SIZE = 10 * 1024 * 1024  # 10MB


def handler(event, context):
    """
    POST /upload
    Body: {"applicationId": "...", "docType": "salary_slip", "fileName": "slip.pdf", "contentType": "application/pdf"}
    Returns: {"uploadUrl": "https://...", "key": "uploads/salary-slips/APP123/slip.pdf"}
    """
    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})
    try:
        body = json.loads(event.get("body", "{}"))
    except (json.JSONDecodeError, TypeError):
        return _response(400, {"error": "Invalid JSON body"})

    application_id = body.get("applicationId")
    doc_type = body.get("docType")
    file_name = body.get("fileName", f"doc-{uuid.uuid4().hex[:8]}")
    content_type = body.get("contentType", "application/pdf")

    if not valid_application_id(application_id):
        return _response(400, {"error": "valid applicationId required"})
    # Staff for any application; a customer only for their own draft (sql/044).
    staff = is_staff_request(event)
    if not (staff or customer_can_upload(event, application_id)):
        return _response(401, {"error": "sign-in required"})
    if doc_type not in DOC_TYPE_FOLDERS:
        return _response(400, {"error": f"Invalid docType. Must be one of: {list(DOC_TYPE_FOLDERS.keys())}"})
    if content_type not in ALLOWED_TYPES:
        return _response(400, {"error": f"Invalid file type. Allowed: {list(ALLOWED_TYPES)}"})

    # Customers upload into incoming/ only. POST /finalize (document_finalize) then
    # unlocks, masks Aadhaar and moves the file into its folder (sql/045).
    folder = DOC_TYPE_FOLDERS[doc_type] if staff else "incoming"
    safe_name = re.sub(r"[^\w.-]+", "_", file_name)[-100:] or "document"
    key = f"{folder}/{application_id}/{uuid.uuid4().hex[:8]}-{safe_name}"

    presigned_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=300,  # 5 minutes
    )

    return _response(200, {
        "uploadUrl": presigned_url,
        "key": key,
        "expiresIn": 300,
    })


def get_extractions_handler(event, context):
    """
    GET /extraction/{applicationId}
    Returns all extracted fields for an application.
    """
    application_id = (event.get("pathParameters") or {}).get("applicationId")
    if not valid_application_id(application_id):
        return _response(400, {"error": "valid applicationId required"})
    # Staff see everything; a customer sees what was read from their own draft's
    # documents, to pre-fill step 4 (sql/046), and only the fields step 4 uses.
    staff = is_staff_request(event)
    if not (staff or customer_can_upload(event, application_id)):
        return _response(401, {"error": "sign-in required"})

    prefix = f"extracted/{application_id}/"
    result = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
    contents = result.get("Contents", [])

    extractions = {}
    for obj in contents:
        if not obj["Key"].endswith(".json"):
            continue
        resp = s3.get_object(Bucket=BUCKET, Key=obj["Key"])
        data = json.loads(resp["Body"].read().decode())
        doc_type = data.get("source", obj["Key"].split("/")[-1].replace(".json", ""))
        fields = data.get("fields", {})
        if not staff:
            keep = CUSTOMER_FIELDS.get(doc_type, ())
            fields = {k: {"value": v.get("value"), "confidence": v.get("confidence")}
                      for k, v in fields.items() if k in keep and isinstance(v, dict)}
        extractions[doc_type] = fields

    return _response(200, {
        "applicationId": application_id,
        "extractions": extractions,
        "documentCount": len(extractions),
    })


CUSTOMER_FIELDS = {
    "pan_card": ("name", "father_name", "dob", "pan_number"),
    "aadhaar_card": ("name", "dob", "gender", "address"),
    "salary_slip": ("employee_name", "employer_name", "net_salary", "pay_period"),
    "form16": ("employee_name", "employer_name"),
}
CONTINUE_URL = os.environ.get("CUSTOMER_LOGIN_URL", "https://cercit.github.io/CERCIT_autoloan/login?as=customer")
_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


def resume_handler(event, context):
    """
    POST /resume  {"mobile": "98xxxxxxxx"}   (no sign-in: the customer is on the start screen)

    If this mobile has an application in progress, email a continue link to the
    address used for it and say where it went, masked (s•••@gmail.com).
    """
    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _response(400, {"error": "Invalid JSON body"})
    mobile = re.sub(r"\D", "", str(body.get("mobile", "")))[-10:]
    if not _MOBILE_RE.match(mobile):
        return _response(400, {"error": "Enter a 10-digit Indian mobile number."})
    found = resume_lookup(mobile)
    if not found:
        return _response(200, {"found": False})
    sent = send_continue_link(found["email"], CONTINUE_URL)
    return _response(200, {
        "found": True,
        "sent": sent,
        "emailMasked": found.get("email_masked"),
        "started": found.get("started"),
    })


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body),
    }
