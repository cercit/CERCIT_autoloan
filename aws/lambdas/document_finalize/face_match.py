"""
Face match: the customer's live photo against the photo on their PAN and Aadhaar
(sql/046). Runs inside POST /finalize after a live photo, PAN front or Aadhaar
front is saved, so no extra storage trigger is needed. Never fails the upload.

Amazon Rekognition CompareFaces gives a 0-100 similarity. Bands, to be settled
with policy (reconcile list): 90+ MATCH, 70-90 REVIEW, under 70 MISMATCH.
"""

import boto3
import pymupdf as fitz

from shared.supabase_client import record_face_match

rekognition = boto3.client("rekognition", region_name="ap-south-1")

MATCH, REVIEW = 90.0, 70.0
REK_LIMIT = 5 * 1024 * 1024
KYC_MARKERS = {"PAN": "-pan_card-", "AADHAAR": "-aadhaar_card-"}


def as_image(data: bytes, ctype: str) -> bytes:
    """Rekognition takes JPEG or PNG up to 5 MB: PDFs are drawn as a picture of page 1."""
    if ctype == "application/pdf":
        doc = fitz.open(stream=data, filetype="pdf")
        pix = doc[0].get_pixmap(dpi=150)
        data = pix.tobytes("jpg", jpg_quality=85)
        doc.close()
    while len(data) > REK_LIMIT:
        pix = fitz.Pixmap(data)
        pix.shrink(1)
        data = pix.tobytes("jpg", jpg_quality=85)
    return data


def band(similarity: float | None) -> str:
    if similarity is None:
        return "NO_FACE"
    return "MATCH" if similarity >= MATCH else "REVIEW" if similarity >= REVIEW else "MISMATCH"


def compare(live: bytes, document: bytes) -> float | None:
    """Best similarity of the live face against faces on the document; None if either has no face."""
    try:
        resp = rekognition.compare_faces(SourceImage={"Bytes": live}, TargetImage={"Bytes": document}, SimilarityThreshold=0)
    except rekognition.exceptions.InvalidParameterException:  # no face found in one of the two
        return None
    matches = [m["Similarity"] for m in resp.get("FaceMatches", [])]
    if matches:
        return round(max(matches), 2)
    return 0.0 if resp.get("UnmatchedFaces") else None


def _latest(s3, bucket: str, prefix: str, marker: str = "") -> tuple[bytes, str, str] | None:
    """Newest object under prefix (optionally with marker in its name, front or single side only)."""
    objs = s3.list_objects_v2(Bucket=bucket, Prefix=prefix).get("Contents", [])
    if marker:
        objs = [o for o in objs if marker in o["Key"] and not o["Key"].rsplit("-", 1)[-1].startswith("back")]
    if not objs:
        return None
    key = max(objs, key=lambda o: o["LastModified"])["Key"]
    got = s3.get_object(Bucket=bucket, Key=key)
    side = "single" if "-single." in key else "front"
    return got["Body"].read(), got.get("ContentType", ""), side


def run(s3, bucket: str, app: str, code: str, side: str, data: bytes, ctype: str) -> list[dict]:
    """Compare and record. Returns what was recorded (for the response and tests)."""
    if code == "LIVE_PHOTO":
        live = as_image(data, ctype)
        targets = []
        for doc, marker in KYC_MARKERS.items():
            found = _latest(s3, bucket, f"uploads/kyc/{app}/", marker)
            if found:
                targets.append((doc, found[2], found[0], found[1]))
    elif code in KYC_MARKERS and side in ("front", "single"):
        found = _latest(s3, bucket, f"uploads/other/live-photo/{app}/")
        if not found:
            return []
        live = as_image(found[0], found[1])
        targets = [(code, side, data, ctype)]
    else:
        return []

    out = []
    for doc, doc_side, doc_data, doc_ctype in targets:
        similarity = compare(live, as_image(doc_data, doc_ctype))
        result = band(similarity)
        record_face_match(app, doc, doc_side, similarity, result)
        out.append({"doc_type": doc, "side": doc_side, "similarity": similarity, "result": result})
    return out
