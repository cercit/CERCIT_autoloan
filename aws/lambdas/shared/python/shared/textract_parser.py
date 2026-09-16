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
