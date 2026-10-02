"""Find QR codes on an Aadhaar image so they can be blacked out (reconcile R18).

Older Aadhaar cards and e-Aadhaar print a QR code that still carries the full
number, so masking the printed digits alone does not mask the Aadhaar (RBI KYC
Master Direction: store only the last four). Boxes come back as fractions of the
image (0..1), padded, the same shape the digit masking uses.

zxing-cpp does the finding: about 1 MB, no numpy. OpenCV would have pushed the
function past Lambda's 250 MB limit. return_errors=True also reports a QR it
found but could not fully read (a blurred photo), which is still worth masking.

Best effort: a QR the reader cannot find stays. The caller records whether
anything was masked, and the document checks still look at the file.
"""

import pymupdf as fitz
import zxingcpp

PAD = 0.04  # of the QR's own size, so the quiet zone and edge modules go too


def _gray(pix: "fitz.Pixmap") -> "fitz.Pixmap":
    if pix.alpha:
        pix = fitz.Pixmap(pix, 0)
    if pix.n != 1:
        pix = fitz.Pixmap(fitz.csGRAY, pix)
    return pix


def _detect(gray: "fitz.Pixmap") -> list[tuple[float, float, float, float]]:
    """QR boxes in pixels of `gray`."""
    # zxing reads a 2-D buffer; a gray pixmap has one byte per pixel and no row padding
    buf = memoryview(gray.samples).cast("B", (gray.height, gray.width))
    found = []
    for r in zxingcpp.read_barcodes(buf, formats=zxingcpp.BarcodeFormat.QRCode, return_errors=True):
        p = r.position
        xs = [p.top_left.x, p.top_right.x, p.bottom_right.x, p.bottom_left.x]
        ys = [p.top_left.y, p.top_right.y, p.bottom_right.y, p.bottom_left.y]
        found.append((min(xs), min(ys), max(xs), max(ys)))
    return found


def find_qr_boxes(pix: "fitz.Pixmap") -> list[tuple[float, float, float, float]]:
    """QR boxes as padded fractions of the image, from any PyMuPDF Pixmap."""
    gray = _gray(pix)
    w, h = gray.width, gray.height
    boxes = _detect(gray)
    if not boxes and max(w, h) < 1600:
        # A dense QR in a small photo: try it at twice the size.
        big = fitz.Pixmap(gray, w * 2, h * 2, None)
        boxes = [(x0 / 2, y0 / 2, x1 / 2, y1 / 2) for x0, y0, x1, y1 in _detect(big)]
    out = []
    for x0, y0, x1, y1 in boxes:
        side = max(x1 - x0, y1 - y0)
        if side < 0.03 * min(w, h):  # specks are not a QR
            continue
        p = side * PAD
        out.append((max(0.0, (x0 - p) / w), max(0.0, (y0 - p) / h), min(1.0, (x1 + p) / w), min(1.0, (y1 + p) / h)))
    return out
