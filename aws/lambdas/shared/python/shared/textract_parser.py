"""
Shared Textract response parser for all cercit document extractors.
Converts raw Textract AnalyzeDocument output into structured key-value
pairs and tables with confidence scores.
"""

import re
from typing import Any


def parse_key_value_pairs(blocks: list[dict]) -> dict[str, dict]:
    """Extract KEY_VALUE_SET blocks into {key: {value, confidence}}."""
    key_map: dict[str, dict] = {}
    value_map: dict[str, dict] = {}
    block_map: dict[str, dict] = {}

    for block in blocks:
        block_id = block["Id"]
        block_map[block_id] = block

        if block["BlockType"] == "KEY_VALUE_SET":
            if "KEY" in block.get("EntityTypes", []):
                key_map[block_id] = block
            else:
                value_map[block_id] = block

    results: dict[str, dict] = {}
    for key_id, key_block in key_map.items():
        key_text = _get_text_from_children(key_block, block_map)
        value_text = ""
        value_confidence = 0.0

        for rel in key_block.get("Relationships", []):
            if rel["Type"] == "VALUE":
                for vid in rel["Ids"]:
                    val_block = block_map.get(vid, {})
                    value_text = _get_text_from_children(val_block, block_map)
                    value_confidence = val_block.get("Confidence", 0) / 100

        if key_text.strip():
            results[key_text.strip().lower()] = {
                "value": value_text.strip(),
                "confidence": round(
                    min(key_block.get("Confidence", 0) / 100, value_confidence or 1.0),
                    3,
                ),
            }

    return results


def parse_tables(blocks: list[dict]) -> list[list[dict]]:
    """Extract TABLE blocks into a list of row-lists."""
    block_map = {b["Id"]: b for b in blocks}
    tables: list[list[dict]] = []

    for block in blocks:
        if block["BlockType"] != "TABLE":
            continue

        rows: dict[int, dict[int, dict]] = {}
        for rel in block.get("Relationships", []):
            if rel["Type"] != "CHILD":
                continue
            for cell_id in rel["Ids"]:
                cell = block_map.get(cell_id, {})
                if cell.get("BlockType") != "CELL":
                    continue
                r = cell.get("RowIndex", 0)
                c = cell.get("ColumnIndex", 0)
                text = _get_text_from_children(cell, block_map)
                rows.setdefault(r, {})[c] = {
                    "text": text.strip(),
                    "confidence": round(cell.get("Confidence", 0) / 100, 3),
                }

        table_rows = []
        for r_idx in sorted(rows.keys()):
            row = []
            for c_idx in sorted(rows[r_idx].keys()):
                row.append(rows[r_idx][c_idx])
            table_rows.append(row)
        tables.append(table_rows)

    return tables


def _get_text_from_children(block: dict, block_map: dict) -> str:
    """Concatenate WORD/SELECTION_ELEMENT text from a block's children."""
    parts: list[str] = []
    for rel in block.get("Relationships", []):
        if rel["Type"] != "CHILD":
            continue
        for child_id in rel["Ids"]:
            child = block_map.get(child_id, {})
            if child.get("BlockType") == "WORD":
                parts.append(child.get("Text", ""))
            elif child.get("BlockType") == "SELECTION_ELEMENT":
                parts.append("X" if child.get("SelectionStatus") == "SELECTED" else "")
    return " ".join(parts)


def normalize_amount(raw: str) -> int | None:
    """Convert '85,000.00' or 'Rs. 85000' to integer paise-free amount."""
    cleaned = re.sub(r"[^\d.]", "", raw)
    if not cleaned:
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def fuzzy_field_match(
    candidates: dict[str, dict], patterns: list[str]
) -> dict[str, Any] | None:
    """Find the first key-value pair whose key contains any of the patterns."""
    for key, val in candidates.items():
        for pat in patterns:
            if pat in key:
                return {"key": key, **val}
    return None


# ---------------------------------------------------------------------------
# Reading a document (shared by the document readers, 28 Sep 2026)
# ---------------------------------------------------------------------------

def analyze(textract, bucket: str, key: str, features: list[str], wait_seconds: int = 90) -> list[dict]:
    """Textract blocks for a file in S3. One-page files use the quick call; a
    multi-page PDF (Form 16, e-statements) is not supported there, so it goes
    through the asynchronous job instead."""
    import time

    try:
        return textract.analyze_document(
            Document={"S3Object": {"Bucket": bucket, "Name": key}}, FeatureTypes=features
        ).get("Blocks", [])
    except textract.exceptions.UnsupportedDocumentException:
        pass

    job_id = textract.start_document_analysis(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}, FeatureTypes=features
    )["JobId"]
    for _ in range(max(1, wait_seconds // 3)):
        time.sleep(3)
        result = textract.get_document_analysis(JobId=job_id)
        if result["JobStatus"] == "SUCCEEDED":
            blocks = result.get("Blocks", [])
            token = result.get("NextToken")
            while token:
                more = textract.get_document_analysis(JobId=job_id, NextToken=token)
                blocks.extend(more.get("Blocks", []))
                token = more.get("NextToken")
            return blocks
        if result["JobStatus"] == "FAILED":
            raise RuntimeError(f"Textract job failed: {result.get('StatusMessage')}")
    raise TimeoutError("Textract job did not finish in time")


_COMPANY_WORDS = re.compile(
    r"\b(ltd|limited|pvt|private|llp|inc|corporation|corp|technologies|technology|solutions|services|"
    r"systems|industries|enterprises|bank|finance|motors|consultancy|software|infotech|labs)\b\.?",
    re.IGNORECASE,
)


def company_name_from_lines(blocks: list[dict]) -> str | None:
    """Payslips usually print the employer as a heading, not as "Employer: ...".
    The first line near the top of page 1 that reads like a company name."""
    lines = [
        b for b in blocks
        if b.get("BlockType") == "LINE" and b.get("Page", 1) == 1 and "Text" in b
        and b.get("Geometry", {}).get("BoundingBox", {}).get("Top", 1) < 0.3
    ]
    lines.sort(key=lambda b: b["Geometry"]["BoundingBox"]["Top"])
    for b in lines:
        text = b["Text"].strip()
        if 4 <= len(text) <= 120 and _COMPANY_WORDS.search(text) and not re.search(r"payslip|pay slip|salary slip", text, re.I):
            return text.rstrip(" ,.-")
    return None
