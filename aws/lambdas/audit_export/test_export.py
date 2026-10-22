"""Checks for the audit export's file naming and checksums (no AWS, no database).

Run:  python test_export.py
"""

import sys
import types

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


check("nothing copied yet starts at 0", h.last_seq_from_keys([]), 0)
check("file names sort and carry the range", h.chain_key(1, 4265), "chain/000000000001-000000004265.jsonl")
check("resumes after the highest copied link",
      h.last_seq_from_keys([h.chain_key(1, 4265), h.chain_key(4266, 4400), "head/2026-10-22.json"]), 4400)
check("other files are ignored", h.last_seq_from_keys(["chain/readme.txt", "head/x.json"]), 0)
check("checksum is base64 MD5", h.md5_b64(b"abc"), "kAFQmDzST7DWlj99KOF/cg==")
check("one line per link, stable key order", h.to_jsonl([{"b": 1, "a": 2}, {"a": 3}]), b'{"a":2,"b":1}\n{"a":3}\n')

print("\nall passed" if not fails else f"\n{fails} failed")
sys.exit(1 if fails else 0)
