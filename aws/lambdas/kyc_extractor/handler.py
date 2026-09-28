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

from shared.textract_parser import analyze, parse_key_value_pairs, fuzzy_field_match
from shared.supabase_client import upsert_extraction

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

    blocks = analyze(textract, bucket, key, ["FORMS"])
    kv_pairs = parse_key_value_pairs(blocks)
    raw_text = _get_all_text(blocks)
    lines = _lines(blocks)

    if doc_type == "pan_card":
        fields = _extract_pan(kv_pairs, raw_text)
        _pan_from_lines(fields, lines)
    else:
        fields = _extract_aadhaar(kv_pairs, raw_text)
        _aadhaar_from_lines(fields, lines)

    try:
        cross_check = _cross_validate_name(application_id, fields, doc_type)
        if cross_check:
            fields["_cross_validation"] = cross_check
    except Exception as e:  # noqa: BLE001 - never lose the reading over a cross-check
        print(f"name cross-check skipped: {type(e).__name__}")

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

    try:
        upsert_extraction(application_id, doc_type, fields)
    except Exception as e:  # noqa: BLE001 - the S3 file above is what the screens read
        print(f"database copy skipped: {type(e).__name__}")

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
            # "S/O: <father>, <house>..." read as a pair loses its label; keep it so the
            # father's name can be taken from the front of the address.
            rel = re.search(r"\b([sdcw])\s*/\s*[o0]\b", str(match.get("key", "")), re.I)
            if field_name == "address" and rel:
                fields[field_name]["value"] = f"{rel.group(1).upper()}/O: {match['value']}"

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


# ---------------------------------------------------------------------------
# Line-by-line reading. Downloaded e-Aadhaar and e-PAN PDFs print most details
# without "Label: value" pairs (a bare "MALE", a "DOB: .." line, an address that
# runs over several lines), so the form reader alone misses them.
# ---------------------------------------------------------------------------

_DATE = re.compile(r"\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b")
_PIN = re.compile(r"\b[1-9]\d{2}\s?\d{3}\b")
# An Aadhaar number, full or masked ("XXXX XXXX 1234", or "XXXX XXXX" when the last group
# was cut off): never part of an address.
_UID = re.compile(r"\b(?:[\dXx]{4}[\s-]?[\dXx]{4}[\s-]?\d{4}|[Xx]{4}[\s-]?[Xx]{4})\b")
_RELATION = re.compile(r"\b(S/O|D/O|C/O|W/O|S/0|D/0|C/0)\s*[:.]?\s*([^,\n]+)", re.I)
_NOT_ADDRESS = re.compile(r"aadhaar|\bVID\b|mobile|download|issue|enrol|help|www\.|@|government|unique", re.I)


def _lines(blocks: list[dict]) -> list[str]:
    out = []
    for b in blocks:
        if b.get("BlockType") == "LINE" and b.get("Text"):
            text = re.sub(r"[^\x20-\x7E]+", " ", b["Text"])  # drop the Hindi half of bilingual labels
            text = re.sub(r"\s+", " ", text).strip(" /:|-")
            if text:
                out.append(text)
    return out


def _value_after(lines: list[str], label: re.Pattern) -> str:
    """The text after a label on its line, or the next line when the label stands alone."""
    for i, line in enumerate(lines):
        m = label.search(line)
        if not m:
            continue
        rest = line[m.end():].strip(" :/-")
        if rest:
            return rest
        if i + 1 < len(lines):
            return lines[i + 1]
    return ""


def _is_name(s: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z .']{1,60}", s)) and not re.search(
        r"\b(government|india|income|tax|department|card|signature|name|father|birth|dob|male|female)\b", s, re.I)


def _pan_from_lines(fields: dict, lines: list[str]) -> None:
    if "father_name" not in fields:
        v = _value_after(lines, re.compile(r"father'?s?\s*name", re.I))
        if _is_name(v):
            fields["father_name"] = {"value": v, "confidence": 0.75, "source": "lines"}
    if "name" not in fields:
        v = _value_after(lines, re.compile(r"(?<!father's )(?<!fathers )\bname\b", re.I))
        if _is_name(v):
            fields["name"] = {"value": v, "confidence": 0.75, "source": "lines"}
    if "dob" not in fields:
        for line in lines:
            m = _DATE.search(line)
            if m:
                fields["dob"] = {"value": m.group(0), "confidence": 0.75, "source": "lines"}
                break


def _aadhaar_from_lines(fields: dict, lines: list[str]) -> None:
    dob_at = None
    for i, line in enumerate(lines):
        if re.search(r"\bDOB\b|birth", line, re.I):
            m = _DATE.search(line) or re.search(r"\b(19|20)\d{2}\b", line)
            if m:
                dob_at = i
                if "dob" not in fields:
                    fields["dob"] = {"value": m.group(0), "confidence": 0.85, "source": "lines"}
                break

    if "gender" not in fields or not re.search(r"male|female|transgender", str(fields["gender"].get("value")), re.I):
        for line in lines:
            m = re.search(r"\b(FEMALE|MALE|TRANSGENDER)\b", line, re.I)
            if m:
                fields["gender"] = {"value": m.group(1).upper(), "confidence": 0.9, "source": "lines"}
                break

    # The name is printed just above the date of birth on the card.
    if "name" not in fields and dob_at:
        for j in range(dob_at - 1, max(dob_at - 3, -1), -1):
            if _is_name(lines[j]):
                fields["name"] = {"value": lines[j], "confidence": 0.75, "source": "lines"}
                break

    address = _address_block(lines)
    old = str((fields.get("address") or {}).get("value") or "")
    if address and (not _PIN.search(old) or len(address) > len(old)):
        fields["address"] = {"value": address, "confidence": 0.8, "source": "lines"}
    elif old:
        fields["address"]["value"] = _clean_address(old)

    rel = _RELATION.search(str((fields.get("address") or {}).get("value") or ""))
    if rel and "father_name" not in fields and rel.group(1).upper()[0] in "SDC":
        name = rel.group(2).strip()
        if _is_name(re.sub(r"^late\s+", "", name, flags=re.I)):
            fields["father_name"] = {
                "value": name,
                "confidence": 0.7 if rel.group(1).upper().startswith("C") else 0.85,
                "source": "address " + rel.group(1).upper().replace("0", "O"),
            }


def _clean_address(text: str) -> str:
    text = _UID.sub(" ", text)
    text = re.sub(r"\s*,\s*(,\s*)+", ", ", text)
    return re.sub(r"\s+", " ", text).strip(" ,")


def _address_block(lines: list[str]) -> str:
    """From the "Address" label (or the S/O, C/O line) down to the line with the PIN code."""
    starts = [i for i, l in enumerate(lines) if re.match(r"address\b", l, re.I)]
    starts += [i for i, l in enumerate(lines) if _RELATION.match(l) and i not in starts]
    for start in starts:
        parts = []
        for line in lines[start:start + 9]:
            if _NOT_ADDRESS.search(line):
                continue
            text = re.sub(r"^address\s*[:\-]?\s*", "", line, flags=re.I)
            text = _UID.sub(" ", text).strip(" ,")
            if text:
                parts.append(text)
            if _PIN.search(text):
                return _clean_address(", ".join(parts))
    return ""


def _cross_validate_name(application_id: str, current_fields: dict, current_type: str) -> dict | None:
    """Check name consistency across already-extracted KYC docs."""
    existing = _saved_reads(application_id)
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


def _saved_reads(application_id: str) -> list[dict]:
    """What the other readers already found for this application (their S3 files).
    The document_extractions table does not take these rows yet (reconcile list R20)."""
    out = []
    try:
        listing = s3.list_objects_v2(Bucket=BUCKET, Prefix=f"extracted/{application_id}/")
        for obj in listing.get("Contents", []):
            if obj["Key"].endswith(".json"):
                data = json.loads(s3.get_object(Bucket=BUCKET, Key=obj["Key"])["Body"].read())
                out.append({"doc_type": data.get("source", ""), "fields": data.get("fields", {})})
    except Exception:  # noqa: BLE001 - a cross-check is a bonus, never a reason to fail
        pass
    return out


def _token_similarity(a: str, b: str) -> float:
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = tokens_a & tokens_b
    return len(overlap) / max(len(tokens_a), len(tokens_b))


def _detect_kyc_type(key: str) -> str:
    lower = key.rsplit("/", 1)[-1].lower()
    # Files from POST /finalize are named <random>-pan_card-<side> or -aadhaar_card-<side>.
    if "-aadhaar_card-" in lower:
        return "aadhaar_card"
    if "-pan_card-" in lower or "pan" in lower:
        return "pan_card"
    return "aadhaar_card"


def _extract_application_id(key: str) -> str | None:
    parts = key.split("/")
    return parts[2] if len(parts) >= 3 else None
