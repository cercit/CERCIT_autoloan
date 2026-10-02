"""Checks for the Aadhaar QR finder on made-up cards (no real Aadhaar).

Run (needs zxing-cpp, pymupdf, and for building the test cards opencv-python-headless,
numpy and qrcode[pil]; the last three are test-only, not shipped):
    python test_qr_mask.py
"""

import io
import random

import cv2
import numpy as np
import pymupdf as fitz
import qrcode

import qr_mask


def pixmap(gray: np.ndarray) -> "fitz.Pixmap":
    g = np.ascontiguousarray(gray)
    return fitz.Pixmap(fitz.csGRAY, g.shape[1], g.shape[0], g.tobytes(), False)


def find_qr_boxes(gray: np.ndarray):
    return qr_mask.find_qr_boxes(pixmap(gray))


def gray_from_pixmap(pix) -> np.ndarray:
    g = qr_mask._gray(pix)
    return np.frombuffer(g.samples, dtype=np.uint8).reshape(g.height, g.width)

random.seed(7)
# Secure QR codes are dense: ~1,000+ characters of signed data
PAYLOAD = "".join(random.choice("0123456789") for _ in range(1400))
fails = 0


def check(name, cond):
    global fails
    print(("ok   " if cond else "FAIL ") + name)
    fails += 0 if cond else 1


def qr_png(data: str, box: int = 4) -> np.ndarray:
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=box, border=4)
    q.add_data(data)
    q.make(fit=True)
    img = q.make_image(fill_color="black", back_color="white").convert("L")
    return np.array(img)


def card(qr: np.ndarray, w=1400, h=900, at=(950, 300)) -> np.ndarray:
    page = np.full((h, w), 255, np.uint8)
    cv2.putText(page, "Government of India  -  sample card", (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.2, 0, 2)
    cv2.putText(page, "XXXX XXXX 1234", (40, 800), cv2.FONT_HERSHEY_SIMPLEX, 1.6, 0, 3)
    qs = min(qr.shape[0], w - at[0] - 20, h - at[1] - 20)
    page[at[1]:at[1] + qs, at[0]:at[0] + qs] = cv2.resize(qr, (qs, qs), interpolation=cv2.INTER_NEAREST)
    return page, (at[0], at[1], at[0] + qs, at[1] + qs)


def covers(boxes, truth, w, h, slack=0.02):
    x0, y0, x1, y1 = truth
    return any(b[0] <= x0 / w + slack and b[1] <= y0 / h + slack and b[2] >= x1 / w - slack and b[3] >= y1 / h - slack
               for b in boxes)


# 1. A clean scan of a card with a dense QR
qr = qr_png(PAYLOAD)
img, truth = card(qr)
b = find_qr_boxes(img)
check("finds the QR on a clean scan", covers(b, truth, img.shape[1], img.shape[0]))
check("and nothing else", len(b) == 1)

# 2. A phone photo: smaller, slightly rotated, blurred, uneven light
small = cv2.resize(img, (1000, 643), interpolation=cv2.INTER_AREA)
M = cv2.getRotationMatrix2D((500, 320), 4, 1.0)
rot = cv2.warpAffine(small, M, (1000, 643), borderValue=255)
blur = cv2.GaussianBlur(rot, (3, 3), 0)
light = np.clip(blur.astype(np.int16) - np.linspace(0, 40, 1000)[None, :].astype(np.int16), 0, 255).astype(np.uint8)
b = find_qr_boxes(light)
# truth after scale + rotation: just check one box lands on the right part of the card
check("finds it on a rotated, blurred phone photo", any(bx[0] > 0.55 and bx[1] > 0.2 for bx in b))

# 3. No QR at all: nothing to mask
blank, _ = card(np.full((10, 10), 255, np.uint8))
check("finds nothing on a card without a QR", find_qr_boxes(blank) == [])

# 4. An e-Aadhaar style PDF: the QR is an image on the page, read through PyMuPDF
doc = fitz.open()
page = doc.new_page(width=595, height=842)
page.insert_text((50, 80), "e-Aadhaar sample (made up)", fontsize=14)
buf = io.BytesIO()
from PIL import Image  # noqa: E402  (qrcode[pil] brings Pillow)
Image.fromarray(qr).save(buf, format="PNG")
qr_rect = fitz.Rect(380, 560, 540, 720)
page.insert_image(qr_rect, stream=buf.getvalue())
pix = page.get_pixmap(dpi=150)
b = find_qr_boxes(gray_from_pixmap(pix))
truth_px = (qr_rect.x0 / 595 * pix.width, qr_rect.y0 / 842 * pix.height, qr_rect.x1 / 595 * pix.width, qr_rect.y1 / 842 * pix.height)
check("finds it inside a PDF page", covers(b, truth_px, pix.width, pix.height))

# 5. Blacking it out leaves nothing a reader can decode
for x0, y0, x1, y1 in b:
    page.add_redact_annot(fitz.Rect(x0 * 595, y0 * 842, x1 * 595, y1 * 842), fill=(0, 0, 0))
page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
after = gray_from_pixmap(page.get_pixmap(dpi=150))
text, _, _ = cv2.QRCodeDetector().detectAndDecode(after)
check("after redaction the QR no longer decodes", text == "" and find_qr_boxes(after) == [])

print(f"\n{'all passed' if not fails else f'{fails} failed'}")
raise SystemExit(1 if fails else 0)
