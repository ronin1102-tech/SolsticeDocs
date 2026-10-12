#!/usr/bin/env python3
"""Generate a deterministic N-page PDF fixture (no dependencies).

Each page: white 612x792, page number text in base-14 Helvetica.
Usage: python3 scripts/gen-fixture.py [pages] [out_path]
"""
import sys

def gen(pages: int, out: str) -> None:
    objs = []  # (obj_num, body_bytes)
    # 1: catalog, 2: pages, 3: font, then per page: page obj + content obj
    kids = " ".join(f"{4 + i * 2} 0 R" for i in range(pages))
    objs.append((1, b"<< /Type /Catalog /Pages 2 0 R >>"))
    objs.append((2, f"<< /Type /Pages /Kids [{kids}] /Count {pages} >>".encode()))
    objs.append((3, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))

    for i in range(pages):
        n = 4 + i * 2
        objs.append((n, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                        f"/Resources << /Font << /F1 3 0 R >> >> /Contents {n + 1} 0 R >>".encode()))
        stream = (f"BT /F1 24 Tf 72 700 Td (SolsticeDocs fixture — page {i + 1} of {pages}) Tj ET").encode()
        objs.append((n + 1, b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"))

    buf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for num, body in objs:
        offsets[num] = len(buf)
        buf += f"{num} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_pos = len(buf)
    count = max(offsets) + 1
    buf += f"xref\n0 {count}\n".encode()
    buf += b"0000000000 65535 f \n"
    for num in range(1, count):
        buf += f"{offsets[num]:010d} 00000 n \n".encode()
    buf += (f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n").encode()
    open(out, "wb").write(buf)
    print(f"wrote {out}: {pages} pages, {len(buf)} bytes")

if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 1200
    o = sys.argv[2] if len(sys.argv) > 2 else "test-fixtures/gen-1200.pdf"
    gen(p, o)
