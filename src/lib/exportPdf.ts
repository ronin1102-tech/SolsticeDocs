// Export: clone the source PDF and stamp the session's annotations in.
// pdf-lib works on bytes we already rendered from (asset protocol / dev server),
// so no extra file access is needed front-end; the resulting bytes go back
// through write_export_cmd (base64) which writes "<name> (annotated).pdf".
import { PDFDocument, rgb } from "pdf-lib";
import { ipc } from "./ipc";
import { PAGE_W, PAGE_H } from "./pdf";
import type { StoredAnnotation } from "./store";

// dims = the page boxes capture used (PDF.js viewport units, per page). Scaling by
// PAGE_W/PAGE_H constants instead raised every stamp ~6% on non-letter docs —
// Tracy's thesis exports landed "a couple of lines above" the drawn spot.
export async function exportPdf(
  sourcePath: string,
  annos: StoredAnnotation[],
  dims: Map<number, { w: number; h: number }>
): Promise<string> {
  const { fetchBytes } = await import("./ipcFetch");
  const { sourceUrlAsync } = await import("./ipc");
  const src = await fetchBytes(await sourceUrlAsync(sourcePath));
  const doc = await PDFDocument.load(src);
  const pages = doc.getPages();
  const exported: StoredAnnotation[] = [];

  for (const a of annos) {
    const page = pages[a.page - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const cap = dims.get(a.page) ?? { w: PAGE_W, h: PAGE_H };
    const sx = width / cap.w; // stored rects are in the captured page's own units
    const sy = height / cap.h;
    const col = hexToRgb(a.color);
    for (const [x, y, w, h] of a.rects) {
      if (a.type === "highlight") {
        page.drawRectangle({
          x: x * sx,
          y: y * sy,
          width: w * sx,
          height: h * sy,
          color: col,
          opacity: 0.35,
        });
      } else {
        const ly = (y + h / 2) * sy; // mid-band underline, matches on-screen look
        page.drawLine({
          start: { x: x * sx, y: ly },
          end: { x: (x + w) * sx, y: ly },
          thickness: Math.max(1, 1.2 * sy),
          color: col,
        });
      }
    }
    exported.push(a);
  }

  const bytes = await doc.save();
  if (annos.length > 0 && exported.length === 0) {
    throw new Error("no pages matched annotations");
  }
  const { bytesToB64 } = await import("./ipcFetch");
  return ipc.writeExport(sourcePath, bytesToB64(bytes));
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
