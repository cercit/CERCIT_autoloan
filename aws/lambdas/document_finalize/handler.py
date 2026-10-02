"""
Lambda: finalise a customer upload (sql/045)

The customer's browser puts the file in incoming/<application>/ and then calls
POST /finalize. This function:

  1. checks the caller owns the draft application (or is staff)
  2. opens a password-locked PDF with the password the customer typed and keeps
     an unlocked copy. The password is used once, in memory; it is never
     logged, stored or returned.
  3. masks an Aadhaar number (first 8 digits blacked out, last 4 left) before
     the file is kept, as the RBI KYC Master Direction asks (amended 29 May 2019).
     The QR code is blacked out too: on older cards it carries the full number (R18)
  4. moves the file into its document folder (which starts the document
     readers), deletes every version of the incoming copy, and registers it with
     the customer's own sign-in, so the database's ownership checks still apply.
"""

import hashlib
import json
import os
import re
import uuid

import boto3
import pymupdf as fitz
from botocore.config import Config

import face_match
import qr_mask

from shared.supabase_client import can_see_customer_data, customer_can_upload, customer_register_document, valid_application_id

s3 = boto3.client("s3", region_name="ap-south-1", config=Config(s3={"addressing_style": "virtual"}))
textract = boto3.client("textract", region_name="ap-south-1")
BUCKET = os.environ.get("DOCS_BUCKET", "cercit-docs")

# document_types.code -> (upload_type, storage_folder); must match sql/044 and 045.
DOC_TYPES = {
    "PAN": ("pan_card", "uploads/kyc"),
    "AADHAAR": ("aadhaar_card", "uploads/kyc"),
    "SALARY_SLIP": ("salary_slip", "uploads/salary-slips"),
    "FORM16_B": ("form16", "uploads/form16"),
    "BANK_STMT": ("bank_statement", "uploads/bank-statements"),
    "QUOTE": ("quote", "uploads/other/quote"),
    "EB_BILL": ("eb_bill", "uploads/other/eb-bill"),
    "COMPANY_ID": ("company_id", "uploads/other/company-id"),
    "LIVE_PHOTO": ("live_photo", "uploads/other/live-photo"),
    "ITR": ("itr", "uploads/other/itr"),
    "MARGIN_RECEIPT": ("margin_receipt", "uploads/other/margin-receipt"),
    "VEHICLE_INVOICE": ("vehicle_invoice", "uploads/other/invoice"),
    "INSURANCE": ("insurance", "uploads/other/insurance"),
    "RC": ("rc", "uploads/other/rc"),
}
MAGIC = {"application/pdf": b"%PDF", "image/jpeg": b"\xff\xd8", "image/png": b"\x89PNG"}
MAX_SIZE = 10 * 1024 * 1024
OCR_LIMIT = 4_500_000  # Textract takes images up to 5 MB
OCR_PAGES = 3


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _response(400, {"error": "Invalid JSON body"})

    app = body.get("applicationId")
    code = body.get("docType")
    side = body.get("side", "single")
    key = body.get("key") or ""
    password = body.get("password") or None

    if not valid_application_id(app):
        return _response(400, {"error": "valid applicationId required"})
    staff = can_see_customer_data(event)
    if not (staff or customer_can_upload(event, app)):
        return _response(401, {"error": "sign-in required"})
    if code not in DOC_TYPES or side not in ("front", "back", "single"):
        return _response(400, {"error": "unknown document"})
    if not re.fullmatch(rf"incoming/{re.escape(app)}/[0-9a-f]{{8}}-[\w.-]{{1,120}}", key) or ".." in key:
        return _response(400, {"error": "that upload does not belong to this application"})

    try:
        obj = s3.get_object(Bucket=BUCKET, Key=key)
    except s3.exceptions.NoSuchKey:
        return _response(404, {"error": "The upload has expired. Choose the file again."})
    data = obj["Body"].read()
    ctype = obj.get("ContentType", "")
    if ctype not in MAGIC or not data.startswith(MAGIC[ctype]):
        _delete_all_versions(key)
        return _response(400, {"error": "That file isn't a real PDF, JPG or PNG."})
    if len(data) > MAX_SIZE:
        _delete_all_versions(key)
        return _response(400, {"error": "The file must be under 10 MB."})

    was_locked = unlocked = False
    masked = 0
    changed = False
    if ctype == "application/pdf":
        try:
            doc = fitz.open(stream=data, filetype="pdf")
        except Exception:  # noqa: BLE001 — any parse failure means an unreadable file
            _delete_all_versions(key)
            return _response(400, {"error": "That PDF can't be opened. Download it again and retry."})
        if doc.needs_pass:
            was_locked = True
            if not password:
                return _response(200, {"status": "PASSWORD_NEEDED"})
            if not doc.authenticate(password):
                return _response(200, {"status": "WRONG_PASSWORD"})
            unlocked = changed = True
        if code == "AADHAAR":
            masked = mask_aadhaar_pdf(doc)
            changed = changed or masked > 0
        if changed:
            data = doc.tobytes(garbage=3, deflate=True, encryption=fitz.PDF_ENCRYPT_NONE)
        doc.close()
    elif code == "AADHAAR":
        data, masked = mask_aadhaar_image(data, ctype)

    upload_type, folder = DOC_TYPES[code]
    original = key.split("/", 2)[2][9:]
    # KYC files carry their type in the name; the KYC reader tells PAN from Aadhaar by it.
    name = f"{upload_type}-{side}{_ext(ctype)}" if folder == "uploads/kyc" else original
    final_key = f"{folder}/{app}/{uuid.uuid4().hex[:8]}-{name}"
    s3.put_object(Bucket=BUCKET, Key=final_key, Body=data, ContentType=ctype)
    _delete_all_versions(key)

    result = {"status": "OK", "key": final_key, "wasLocked": was_locked, "unlocked": unlocked, "masked": masked > 0}
    if staff:
        return _response(200, result)

    ok, reply = customer_register_document(event, {
        "p_application_id": app,
        "p_doc_type": code,
        "p_side": side,
        "p_storage_key": final_key,
        "p_file_name": body.get("fileName") or original,
        "p_mime_type": ctype,
        "p_size_bytes": len(data),
        "p_sha256": hashlib.sha256(data).hexdigest(),
        "p_backend": "s3",
        "p_was_locked": was_locked,
        "p_unlocked": unlocked,
        "p_masked": masked > 0,
    })
    if not ok:
        _delete_all_versions(final_key)
        return _response(400, {"error": reply})
    result["document"] = reply
    # Live photo against the PAN and Aadhaar photos; a failure here never fails the upload.
    try:
        face_match.run(s3, BUCKET, app, code, side, data, ctype)
    except Exception as e:  # noqa: BLE001
        print(f"face match skipped for {app} {code}: {type(e).__name__}")
    return _response(200, result)


# --- Aadhaar masking ---------------------------------------------------------

def aadhaar_spans(words: list[str]) -> list[tuple[int, int]]:
    """Index ranges of words holding the first 8 digits of an Aadhaar number.

    Aadhaar is 12 digits, first digit 2-9, printed as 4-4-4. A 16-digit VID
    (4-4-4-4) is left alone. Returns (start, end) word indexes to black out, or a
    negative end for "the first two-thirds of this one 12-digit word".
    """
    spans = []
    i = 0
    n = len(words)
    while i < n:
        w = words[i]
        if re.fullmatch(r"[2-9]\d{11}", w):
            spans.append((i, -1))
            i += 1
            continue
        if (i + 2 < n and re.fullmatch(r"[2-9]\d{3}", w) and re.fullmatch(r"\d{4}", words[i + 1])
                and re.fullmatch(r"\d{4}", words[i + 2]) and not (i + 3 < n and re.fullmatch(r"\d{4}", words[i + 3]))
                and not (i > 0 and re.fullmatch(r"\d{4}", words[i - 1]))):
            spans.append((i, i + 1))
            i += 3
            continue
        i += 1
    return spans


def _mask_rects(words: list[tuple[str, tuple[float, float, float, float]]]) -> list[tuple[float, float, float, float]]:
    rects = []
    for start, end in aadhaar_spans([w for w, _ in words]):
        if end < 0:
            x0, y0, x1, y1 = words[start][1]
            rects.append((x0, y0, x0 + (x1 - x0) * 2 / 3, y1))
        else:
            boxes = [words[j][1] for j in range(start, end + 1)]
            rects.append((min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)))
    return rects


def _ocr_words(image: bytes) -> list[tuple[str, tuple[float, float, float, float]]]:
    """Words and their boxes as fractions of the image (0..1)."""
    blocks = textract.detect_document_text(Document={"Bytes": image}).get("Blocks", [])
    out = []
    for b in blocks:
        if b.get("BlockType") == "WORD" and b.get("Text"):
            box = b["Geometry"]["BoundingBox"]
            out.append((b["Text"], (box["Left"], box["Top"], box["Left"] + box["Width"], box["Top"] + box["Height"])))
    return out


def _qr_rects_pdf(page) -> list:
    """QR codes on a PDF page, in page coordinates."""
    pix = page.get_pixmap(dpi=150)
    W, H = page.rect.width, page.rect.height
    return [fitz.Rect(x0 * W, y0 * H, x1 * W, y1 * H) * page.derotation_matrix
            for x0, y0, x1, y1 in qr_mask.find_qr_boxes(pix)]


def mask_aadhaar_pdf(doc) -> int:
    count = 0
    for page in list(doc)[:OCR_PAGES]:
        words = [(w[4], (w[0], w[1], w[2], w[3])) for w in page.get_text("words")]
        rects = [fitz.Rect(r) for r in _mask_rects(words)]
        try:
            qr_rects = _qr_rects_pdf(page)
        except Exception as e:  # noqa: BLE001 — a QR we cannot look for must not stop the upload
            print(f"qr check skipped: {type(e).__name__}")
            qr_rects = []
        if not rects:  # scanned page, or the number is inside an image
            pix = page.get_pixmap(dpi=200)
            png = pix.tobytes("png")
            if len(png) > OCR_LIMIT:
                pix = page.get_pixmap(dpi=120)
                png = pix.tobytes("png")
            W, H = page.rect.width, page.rect.height
            for x0, y0, x1, y1 in _mask_rects(_ocr_words(png)):
                rects.append(fitz.Rect(x0 * W, y0 * H, x1 * W, y1 * H) * page.derotation_matrix)
        rects += qr_rects
        for r in rects:
            page.add_redact_annot(r + (-2, -2, 2, 2), fill=(0, 0, 0))
        if rects:
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
            count += len(rects)
    return count


def mask_aadhaar_image(data: bytes, ctype: str) -> tuple[bytes, int]:
    pix = fitz.Pixmap(data)
    if pix.alpha:
        pix = fitz.Pixmap(pix, 0)
    ocr = data
    small = pix
    while len(ocr) > OCR_LIMIT:
        small = fitz.Pixmap(small, 0) if small.alpha else fitz.Pixmap(small)
        small.shrink(1)
        ocr = small.tobytes("jpg", jpg_quality=85)
    rects = _mask_rects(_ocr_words(ocr))
    try:
        rects += qr_mask.find_qr_boxes(pix)
    except Exception as e:  # noqa: BLE001 — a QR we cannot look for must not stop the upload
        print(f"qr check skipped: {type(e).__name__}")
    if not rects:
        return data, 0
    pad = max(2, pix.width // 200)
    for x0, y0, x1, y1 in rects:
        pix.set_rect(fitz.IRect(int(x0 * pix.width) - pad, int(y0 * pix.height) - pad,
                                int(x1 * pix.width) + pad, int(y1 * pix.height) + pad), (0,) * pix.n)
    out = pix.tobytes("jpg", jpg_quality=90) if ctype == "image/jpeg" else pix.tobytes("png")
    return out, len(rects)


# --- helpers ---------------------------------------------------------------

def _ext(ctype: str) -> str:
    return {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}[ctype]


def _delete_all_versions(key: str) -> None:
    """The bucket keeps old versions, so an unmasked or locked copy must go version by version."""
    resp = s3.list_object_versions(Bucket=BUCKET, Prefix=key)
    for v in resp.get("Versions", []) + resp.get("DeleteMarkers", []):
        if v["Key"] == key:
            s3.delete_object(Bucket=BUCKET, Key=key, VersionId=v["VersionId"])


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body),
    }
