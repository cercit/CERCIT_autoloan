"""
Lambda: nightly copy of the audit chain to a locked S3 bucket (fix list R3, sql/092)

Every night it asks the database for the audit-chain links written since the
last copy (fn_audit_export, service key only) and writes them, with their
events, to the audit archive bucket. That bucket has Object Lock: each file is
kept unchanged for a year, so rewriting the chain inside the database would no
longer match this copy.

Files:
  chain/<first seq>-<last seq>.jsonl   one link (and its event) per line
  head/<UTC date>.json                 the newest link: seq and hash
"""

import base64
import hashlib
import json
import os
import re
import urllib.request
from datetime import datetime, timezone

import boto3

s3 = boto3.client("s3")
BUCKET = os.environ.get("AUDIT_BUCKET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BATCH = 5000
_KEY = re.compile(r"^chain/(\d{12})-(\d{12})\.jsonl$")


def last_seq_from_keys(keys: list[str]) -> int:
    """The highest sequence number already copied (0 if nothing yet)."""
    seqs = [int(m.group(2)) for k in keys if (m := _KEY.match(k))]
    return max(seqs, default=0)


def chain_key(first: int, last: int) -> str:
    return f"chain/{first:012d}-{last:012d}.jsonl"


def md5_b64(body: bytes) -> str:
    """Object Lock buckets refuse a write without a checksum."""
    return base64.b64encode(hashlib.md5(body).digest()).decode()


def to_jsonl(rows: list[dict]) -> bytes:
    return ("\n".join(json.dumps(r, sort_keys=True, separators=(",", ":")) for r in rows) + "\n").encode()


def _copied_keys() -> list[str]:
    keys, token = [], None
    while True:
        kw = {"Bucket": BUCKET, "Prefix": "chain/"}
        if token:
            kw["ContinuationToken"] = token
        resp = s3.list_objects_v2(**kw)
        keys += [o["Key"] for o in resp.get("Contents", [])]
        if not resp.get("IsTruncated"):
            return keys
        token = resp["NextContinuationToken"]


def _export(after: int) -> list[dict]:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/fn_audit_export",
        data=json.dumps({"p_after_seq": after, "p_limit": BATCH}).encode(),
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                 "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"[]")


def _put(key: str, body: bytes, content_type: str) -> None:
    s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType=content_type, ContentMD5=md5_b64(body))


def handler(event, context):
    after = last_seq_from_keys(_copied_keys())
    copied, head = 0, None
    while True:
        rows = _export(after)
        if not rows:
            break
        first, last = rows[0]["seq"], rows[-1]["seq"]
        _put(chain_key(first, last), to_jsonl(rows), "application/x-ndjson")
        copied += len(rows)
        after, head = last, {"seq": last, "link_hash": rows[-1]["link_hash"]}
        if len(rows) < BATCH:
            break
    if head:
        head["copied_at"] = datetime.now(timezone.utc).isoformat()
        _put(f"head/{datetime.now(timezone.utc):%Y-%m-%d}.json", json.dumps(head).encode(), "application/json")
    print(f"audit export: copied {copied} links, now at seq {after}")
    return {"copied": copied, "last_seq": after}
