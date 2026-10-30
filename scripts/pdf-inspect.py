"""Inspect a PDF produced by Electron: page size, embedded fonts, extractable text; optionally render a PNG.
Usage: python scripts/pdf-inspect.py file.pdf [out.png]   (needs `pip install pymupdf` in a venv)
"""
import sys
import warnings

warnings.filterwarnings("ignore")
import pymupdf  # noqa: E402

path = sys.argv[1]
doc = pymupdf.open(path)
print(f"pages: {len(doc)}")
for i, page in enumerate(doc):
    r = page.rect
    print(f"page {i + 1}: {r.width:.0f} x {r.height:.0f} pt  (A4 = 595 x 842)")
    for xref, ext, kind, basefont, name, enc in page.get_fonts():
        info = doc.extract_font(xref)  # (name, ext, type, content)
        embedded = bool(info[3]) if info else False
        print(f"  font: {basefont!r:50} type={kind:10} embedded={'YES' if embedded else 'NO'}  ({len(info[3]) if info and info[3] else 0} bytes)")
text = doc[0].get_text().strip().replace("\n", " | ")
print("text layer (first 220 chars):", text[:220])
if len(sys.argv) > 2:
    doc[0].get_pixmap(dpi=110).save(sys.argv[2])
    print("rendered ->", sys.argv[2])
