"""
Lambda: Presigned URL generator (SCRUM-36)

Returns a presigned S3 PUT URL so the browser can upload
documents directly to S3 without going through API Gateway
(avoids the 10MB payload limit).
"""

import json
import os
import uuid
import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    region_name="ap-south-1",
    config=Config(s3={"addressing_style": "virtual"}),
    endpoint_url="https://s3.ap-south-1.amazonaws.com",
)
BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")

DOC_TYPE_FOLDERS = {
    "salary_slip": "uploads/salary-slips",
    "form16": "uploads/form16",
    "bank_statement": "uploads/bank-statements",
    "pan_card": "uploads/kyc",
    "aadhaar_card": "uploads/kyc",
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

    if not application_id:
        return _response(400, {"error": "applicationId required"})
    if doc_type not in DOC_TYPE_FOLDERS:
        return _response(400, {"error": f"Invalid docType. Must be one of: {list(DOC_TYPE_FOLDERS.keys())}"})
    if content_type not in ALLOWED_TYPES:
        return _response(400, {"error": f"Invalid file type. Allowed: {list(ALLOWED_TYPES)}"})

    folder = DOC_TYPE_FOLDERS[doc_type]
    safe_name = file_name.replace("/", "_").replace("\\", "_")
    key = f"{folder}/{application_id}/{safe_name}"

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
    application_id = event.get("pathParameters", {}).get("applicationId")
    if not application_id:
        return _response(400, {"error": "applicationId required"})

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
        extractions[doc_type] = data.get("fields", {})

    return _response(200, {
        "applicationId": application_id,
        "extractions": extractions,
        "documentCount": len(extractions),
    })


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(body),
    }
