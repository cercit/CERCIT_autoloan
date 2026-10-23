"""
Lambda: sweep incoming/ every 15 minutes (fix list G10, interim; 23 Oct 2026)

Customer uploads land in incoming/ and POST /finalize masks the Aadhaar, moves
the file into its folder and deletes every version of the original, usually
within seconds. If a customer drops off mid-upload (or a password is never
given), the original used to wait for the bucket's 1-day lifecycle rule. This
deletes every version, and every delete marker, under incoming/ that is more
than 15 minutes old, so an unmasked copy lives minutes, not a day.

Nothing outside incoming/ is touched.
"""

import os
from datetime import datetime, timedelta, timezone

import boto3

s3 = boto3.client("s3")
BUCKET = os.environ.get("DOCS_BUCKET", "")
PREFIX = "incoming/"
MAX_AGE_MINUTES = 15


def stale_versions(page: dict, now: datetime, minutes: int = MAX_AGE_MINUTES) -> list[dict]:
    """Versions and delete markers under incoming/ older than `minutes`."""
    cutoff = now - timedelta(minutes=minutes)
    out = []
    for v in page.get("Versions", []) + page.get("DeleteMarkers", []):
        if v["Key"].startswith(PREFIX) and v["LastModified"] < cutoff:
            out.append({"Key": v["Key"], "VersionId": v["VersionId"]})
    return out


def batches(items: list, size: int = 1000):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def handler(event, context):
    now = datetime.now(timezone.utc)
    stale: list[dict] = []
    kw = {"Bucket": BUCKET, "Prefix": PREFIX}
    while True:
        page = s3.list_object_versions(**kw)
        stale += stale_versions(page, now)
        if not page.get("IsTruncated"):
            break
        kw["KeyMarker"] = page["NextKeyMarker"]
        kw["VersionIdMarker"] = page["NextVersionIdMarker"]
    for chunk in batches(stale):
        s3.delete_objects(Bucket=BUCKET, Delete={"Objects": chunk, "Quiet": True})
    # counts only: file names can carry an application number
    print(f"incoming sweep: deleted {len(stale)} old versions")
    return {"deleted": len(stale)}
