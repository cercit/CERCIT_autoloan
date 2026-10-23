"""Checks for the incoming/ sweep's age filter (no AWS).

Run:  python test_sweep.py
"""

import sys
import types
from datetime import datetime, timedelta, timezone

if "boto3" not in sys.modules:
    try:
        import boto3  # noqa: F401
    except ImportError:
        fake = types.ModuleType("boto3")
        fake.client = lambda *a, **k: None
        sys.modules["boto3"] = fake

import handler as h  # noqa: E402

fails = 0


def check(label, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(("ok  " if ok else "FAIL"), label, "" if ok else f"(got {got!r}, want {want!r})")


now = datetime(2026, 10, 23, 6, 0, tzinfo=timezone.utc)
page = {
    "Versions": [
        {"Key": "incoming/A1/x-aadhaar.pdf", "VersionId": "v1", "LastModified": now - timedelta(minutes=40)},
        {"Key": "incoming/A1/y-pan.pdf", "VersionId": "v2", "LastModified": now - timedelta(minutes=5)},
        {"Key": "incoming/A2/z.jpg", "VersionId": "v3", "LastModified": now - timedelta(minutes=15, seconds=1)},
        {"Key": "uploads/kyc/A1/kept.pdf", "VersionId": "v4", "LastModified": now - timedelta(days=3)},
    ],
    "DeleteMarkers": [
        {"Key": "incoming/A3/gone.pdf", "VersionId": "d1", "LastModified": now - timedelta(hours=2)},
    ],
}
got = h.stale_versions(page, now, minutes=15)
check("older than 15 minutes is swept (files and delete markers)",
      sorted(v["VersionId"] for v in got), ["d1", "v1", "v3"])
check("a fresh upload (still being finalised) is left alone", any(v["VersionId"] == "v2" for v in got), False)
check("nothing outside incoming/ is ever touched", any(not v["Key"].startswith("incoming/") for v in got), False)
check("empty page, nothing to do", h.stale_versions({}, now, 15), [])
check("batches of at most 1,000 for delete_objects", [len(b) for b in h.batches(list(range(2500)), 1000)], [1000, 1000, 500])

print("\nall passed" if not fails else f"\n{fails} failed")
sys.exit(1 if fails else 0)
