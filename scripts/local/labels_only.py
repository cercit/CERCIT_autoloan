"""Print only the field labels of a document (for designing the document map).

Every digit, every value after ':' and every amount written in words
("Rupees ... only") is blanked before printing. Nothing is saved.
Run locally: python scripts/local/labels_only.py <file.pdf> [password]
"""
import re
import sys

import pdfplumber

WORDS = r"(rupees|rs\.?)\s+[a-z\s-]+only"

path = sys.argv[1]
pw = sys.argv[2] if len(sys.argv) > 2 else None
with pdfplumber.open(path, password=pw) as pdf:
    print("pages:", len(pdf.pages))
    for n, page in enumerate(pdf.pages, 1):
        for line in (page.extract_text() or "").splitlines():
            line = re.sub(WORDS, "[amount in words]", line, flags=re.I)
            if re.search(r":\s*\S", line):
                line = re.sub(r"\s*:\s+.*$", " : [value]", line)
            line = re.sub(r"[₹]?\s*\d[\d,./-]*", "[n]", line)
            line = re.sub(r"(\[n\]\s*)+", "[n] ", line).strip()
            if line and line != "[n]":
                print(f"p{n}: {line}")
