// PDF.js — legacy build (Safari-14-class syntax, per ADR-0001/Catalina pins),
// worker bundled locally via ?url (no CDN, no network — local-first).
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// ?worker (NOT ?url): a raw asset URL bypasses every transform pin, and the worker
// ships private-class-field syntax the Catalina engine cannot parse (jsc-verified:
// 'Invalid character #'). Bundling it through Vite applies the safari13 downgrade.
import PdfWorker from "./pdf.worker.entry.ts?worker";

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export type Doc = pdfjsLib.PDFDocumentProxy;

export async function openDoc(url: string): Promise<Doc> {
  return pdfjsLib.getDocument({ url }).promise;
}

export const PAGE_W = 612;
export const PAGE_H = 792;

// Cap DPR at 2: beyond that we pay fill-rate for no perceived gain on this hardware.
export function dpr(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

export async function renderPageToCanvas(
  doc: Doc,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  zoom: number
): Promise<pdfjsLib.PageViewport> {
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: zoom });
  const k = dpr();
  canvas.width = Math.floor(vp.width * k);
  canvas.height = Math.floor(vp.height * k);
  canvas.style.width = `${Math.floor(vp.width)}px`;
  canvas.style.height = `${Math.floor(vp.height)}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.setTransform(k, 0, 0, k, 0, 0);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return vp;
}
