"""Erase one application's files from the cercit S3 bucket (fix list H6, AWS part).

The bucket keeps old versions, so a plain delete would only hide the files.
This removes every version and delete marker of every key that contains the
application number: the uploads and the readers' extracted JSON.

    python scripts/erase-s3-application.py 202609000016            # list only
    python scripts/erase-s3-application.py 202609000016 --delete   # erase, can't be undone

Prints keys and counts only, never file contents. Needs the AWS CLI signed in.
After erasing, mark the files done in the database:
    SELECT fn_erasure_storage_done(ARRAY(SELECT storage_key FROM fn_erasure_storage_queue()));
"""

import json
import os
import subprocess
import sys
import tempfile

BUCKET = "cercit-docs-885629545739"
REGION = "ap-south-1"


def aws(*args):
    out = subprocess.run(["aws", *args, "--region", REGION, "--output", "json"],
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr.strip())
    return json.loads(out.stdout) if out.stdout.strip() else {}


def versions_for(app_no):
    found, token = [], None
    while True:
        args = ["s3api", "list-object-versions", "--bucket", BUCKET]
        if token:
            args += ["--key-marker", token[0], "--version-id-marker", token[1]]
        page = aws(*args)
        for item in (page.get("Versions") or []) + (page.get("DeleteMarkers") or []):
            if app_no in item["Key"]:
                found.append({"Key": item["Key"], "VersionId": item["VersionId"]})
        if not page.get("IsTruncated"):
            return found
        token = (page["NextKeyMarker"], page["NextVersionIdMarker"])


def main():
    if len(sys.argv) < 2 or not sys.argv[1].isdigit() or len(sys.argv[1]) != 12:
        sys.exit("usage: erase-s3-application.py <12-digit application number> [--delete]")
    app_no, delete = sys.argv[1], "--delete" in sys.argv
    found = versions_for(app_no)
    keys = sorted({f["Key"] for f in found})
    print(f"{len(keys)} files, {len(found)} stored versions for {app_no}")
    for k in keys:
        print("  " + k.split("/")[0] + "/.../" + k.rsplit("/", 1)[-1][:12] + "...")
    if not delete or not found:
        print("Nothing erased." if not delete else "Nothing to erase.")
        return
    for i in range(0, len(found), 1000):
        batch = {"Objects": found[i:i + 1000], "Quiet": True}
        # a payload file, not inline JSON: the shell mangles quotes on Windows
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(batch, f)
        try:
            res = aws("s3api", "delete-objects", "--bucket", BUCKET, "--delete", "file://" + f.name)
        finally:
            os.unlink(f.name)
        if res.get("Errors"):
            sys.exit(f"errors: {res['Errors']}")
    left = versions_for(app_no)
    print(f"Erased. Versions left: {len(left)}")


if __name__ == "__main__":
    main()
