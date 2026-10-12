// DOCS-03-RENDER: windowed continuous scroll (±3 pages), overlay annotation
// canvas, durable-on-stroke-end persistence via store.ts.
// 2026-10-12 fix pass per docs/RENDER-SPEC.md:
//   C1  overlay bitmap+CSS sized to the page box (canvas is a replaced element;
//       `absolute inset-0` alone left it at the 300x150 default)
//   C2  useLayoutEffect mount/restore scroll using DOM offsets
//   C3  uniform slot pitch (placeholders share the rendered-page box)
//   C1a band merge can no longer shrink a rect's right edge
//   plus: restored annotations repaint once their page's bitmap is sized.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { renderPageToCanvas, PAGE_W, PAGE_H, dpr, type Doc } from "./lib/pdf";
import {
  loadSessionAsync,
  saveSession,
  clearSession,
  qaPost,
  type StoredAnnotation,
} from "./lib/store";
import { exportPdf } from "./lib/exportPdf";

const WINDOW = 3; // render current ±3
const TOOL_COLORS: Record<string, string> = { highlight: "#FDE047", underline: "#3B82F6" };
// C3: one shared box for rendered pages and placeholders — uniform pitch.
const SLOT_CLS = "relative mb-4 bg-white shadow-lg";

interface PageSlot {
  num: number;
  canvas?: HTMLCanvasElement;
  overlay?: HTMLCanvasElement;
  renderedFor?: number; // zoom this canvas was rendered at
}

export default function Viewer({
  doc,
  filePath,
  initialPage = 1,
  initialZoom = 1,
}: {
  doc: Doc;
  filePath: string;
  initialPage?: number;
  initialZoom?: number;
}) {
  const [zoom, setZoom] = useState(initialZoom);
  const [page, setPage] = useState(initialPage);
  const [tool, setTool] = useState<"highlight" | "underline">("highlight");
  const [annos, setAnnos] = useState<StoredAnnotation[]>([]);
  const [status, setStatus] = useState("loading");
  const slots = useRef<Map<number, PageSlot>>(new Map());
  const scroller = useRef<HTMLDivElement>(null);
  const sessionRef = useRef({ filePath, hash: filePath, title: filePath });
  const drawing = useRef(false);
  const curRects = useRef<number[][]>([]);
  const pageFromScroll = useRef(false); // C2 guard: page changes caused by scrolling must not re-scroll

  // Per-page geometry (C1 v2): real page boxes incl. /Rotate and landscape — the
  // PAGE_W/PAGE_H constants were portrait-letter assumptions that sheared real
  // slide-deck imports (Tracy's Module-1 deck: landscape slides in portrait boxes).
  const [dims, setDims] = useState<Map<number, { w: number; h: number }>>(new Map());
  const dimsRef = useRef(dims);
  dimsRef.current = dims;
  const dimFor = (n: number): { w: number; h: number } =>
    dimsRef.current.get(n) ?? { w: PAGE_W, h: PAGE_H };

  useEffect(() => {
    let alive = true;
    (async () => {
      const m = new Map<number, { w: number; h: number }>();
      for (let n = 1; n <= doc.numPages; n++) {
        try {
          const pg = await doc.getPage(n);
          const vp = pg.getViewport({ scale: 1 }); // user-space box, rotation applied
          m.set(n, { w: vp.width, h: vp.height });
        } catch {
          m.set(n, { w: PAGE_W, h: PAGE_H });
        }
      }
      if (alive) setDims(m);
    })();
    return () => {
      alive = false;
    };
  }, [doc]);

  // variable pitch (C3 v2): cumulative offsets, binary-searched in onScroll
  const offsetsRef = useRef<number[]>([0]);
  useLayoutEffect(() => {
    const arr = [0];
    for (let i = 1; i <= doc.numPages; i++) arr.push(arr[i - 1] + dimFor(i).h * zoom + 16);
    offsetsRef.current = arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, zoom, doc]);

  // --- open restore (async: native mode reads SQLite, browser reads LS) ---
  useEffect(() => {
    let alive = true;
    loadSessionAsync().then((s) => {
      if (!alive || !s || s.filePath !== filePath) return;
      setZoom(s.zoom);
      setPage(s.lastPage);
      setAnnos(s.annotations);
      setStatus(`restored p${s.lastPage}`);
    });
    return () => {
      alive = false;
    };
  }, [filePath]);

  // --- export annotated PDF (native mode; browser shows a hint) ---
  const onExport = async () => {
    setStatus("exporting…");
    try {
      const to = await exportPdf(filePath, annos, dims);
      setStatus(`exported → ${to.split("/").pop()}`);
    } catch (e) {
      setStatus(`export failed: ${String(e).slice(0, 60)}`);
    }
  };

  // --- C2: move the viewport to the current page synchronously before paint.
  // DOM offsets (not computed pitch) — immune to margin asymmetries. Fires on
  // mount (deep link) and on restore-setPage; skipped when the page change
  // came from onScroll (else it would pin the viewport to page tops).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (pageFromScroll.current) {
      pageFromScroll.current = false;
      return;
    }
    // slots live one level down: scroller > column div > slot divs
    const col = el.firstElementChild as HTMLElement | undefined;
    const child = col?.children[page - 1] as HTMLElement | undefined;
    if (child) el.scrollTop = child.offsetTop - 4;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, dims]);

  // --- persist (durable-on-stroke-end contract: every mutation calls this) ---
  const persist = (nextZoom: number, nextPage: number, nextAnnos: StoredAnnotation[]) => {
    saveSession({
      ...sessionRef.current,
      filePath,
      lastPage: nextPage,
      zoom: nextZoom,
      annotations: nextAnnos,
    });
  };

  // --- windowed rendering ---
  useEffect(() => {
    let alive = true;
    const container = scroller.current;
    if (!container) return;

    const render = async () => {
      const cur = page;
      for (let n = Math.max(1, cur - WINDOW); n <= Math.min(doc.numPages, cur + WINDOW); n++) {
        const slot = slots.current.get(n);
        if (!slot || !slot.canvas || slot.renderedFor === zoom) continue;
        setStatus(`rendering p${n}`);
        try {
          await renderPageToCanvas(doc, n, slot.canvas, zoom);
        } catch {
          continue; // page torn down mid-render
        }
        if (!alive) return;
        slot.renderedFor = zoom;
        setStatus(`${doc.numPages} pages · p${cur}`);
      }
      qaPost("render", { page, zoom });
    };
    render();

    const onScroll = () => {
      const offs = offsetsRef.current;
      const st = container.scrollTop;
      let lo = 1, hi = doc.numPages;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offs[mid - 1] <= st) lo = mid;
        else hi = mid - 1;
      }
      const p = lo;
      if (p !== page) {
        pageFromScroll.current = true;
        setPage(p);
        persist(zoom, p, annos);
      }
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      alive = false;
      container.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, page, zoom, annos]);

  // --- annotation overlay drawing ---
  const overlayFor = (n: number) => {
    return annos.filter((a) => a.page === n);
  };

  // paint one slot's stored annotations onto its overlay bitmap
  const drawOverlayFor = (n: number, c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const k = c.width / (dimFor(n).w * zoom);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const a of overlayFor(n)) {
      ctx.fillStyle = a.color + "55"; // translucent fill
      ctx.strokeStyle = a.color;
      ctx.lineWidth = Math.max(1, 2 * k);
      for (const [x, y, w, h] of a.rects) {
        const rx = x * zoom * k;
        const ry = (dimFor(n).h - y - h) * zoom * k; // PDF origin bottom-left → canvas top-left
        if (a.type === "highlight") {
          ctx.fillRect(rx, ry, w * zoom * k, h * zoom * k);
        } else {
          ctx.beginPath();
          ctx.moveTo(rx, ry + h * zoom * k);
          ctx.lineTo(rx + w * zoom * k, ry + h * zoom * k);
          ctx.stroke();
        }
      }
    }
  };

  useEffect(() => {
    // redraw overlays on in-DOM slots whenever annos or zoom change;
    // freshly mounted PageViews paint themselves after sizing (see PageView)
    for (const [n, slot] of slots.current) {
      if (slot.overlay && slot.overlay.isConnected) drawOverlayFor(n, slot.overlay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annos, zoom, page]);

  // --- mouse → PDF-units rect collection (horizontal bands; good enough v1) ---
  const onOverlayDown = (e: React.MouseEvent<HTMLCanvasElement>, n: number) => {
    drawing.current = true;
    curRects.current = [];
    record(e, n);
  };
  const onOverlayMove = (e: React.MouseEvent<HTMLCanvasElement>, n: number) => {
    if (drawing.current) record(e, n);
  };
  const record = (e: React.MouseEvent<HTMLCanvasElement>, n: number) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const d = dimFor(n);
    // C1: the overlay fills the page box, so this conversion is zoom-independent
    const x = ((e.clientX - r.left) / r.width) * d.w;
    const h = 14; // band height in PDF units
    const yTop = ((e.clientY - r.top) / r.height) * d.h;
    const y = d.h - yTop - h; // store as PDF-units bottom-left origin
    const rects = curRects.current;
    const last = rects[rects.length - 1];
    if (last && Math.abs(last[1] - y) < h * 0.6) {
      // C1a: merge into current band — extend to x on BOTH sides, never shrink
      const x2 = Math.max(last[0] + last[2], x);
      last[0] = Math.min(last[0], x);
      last[2] = x2 - last[0];
    } else {
      rects.push([Math.min(x, d.w - 10), y, 10, h]);
    }
    drawLive(c, n);
  };
  const drawLive = (c: HTMLCanvasElement, n: number) => {
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const k = c.width / (dimFor(n).w * zoom);
    const color = TOOL_COLORS[tool];
    ctx.fillStyle = color + "55";
    ctx.strokeStyle = color;
    for (const [x, y, w, h] of curRects.current) {
      const rx = x * zoom * k;
      const ry = (dimFor(n).h - y - h) * zoom * k;
      if (tool === "highlight") ctx.fillRect(rx, ry, w * zoom * k, h * zoom * k);
      else {
        ctx.lineWidth = Math.max(1, 2 * k);
        ctx.beginPath();
        ctx.moveTo(rx, ry + h * zoom * k);
        ctx.lineTo(rx + w * zoom * k, ry + h * zoom * k);
        ctx.stroke();
      }
    }
  };
  const onOverlayUp = (pageNum: number) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (curRects.current.length === 0) return;
    const a: StoredAnnotation = {
      id: Date.now(),
      page: pageNum,
      type: tool,
      color: TOOL_COLORS[tool],
      rects: curRects.current,
    };
    const next = [...annos, a];
    setAnnos(next);
    persist(zoom, page, next); // durable-on-stroke-end
    curRects.current = [];
    qaPost("annotation", { page: pageNum, type: tool, total: next.length });
  };

  // --- zoom helpers ---
  const applyZoom = (z: number) => {
    const zz = Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));
    setZoom(zz);
    persist(zz, page, annos);
  };

  const colW = dims.size
    ? Math.max(...[...dims.values()].map((d) => d.w), PAGE_W)
    : PAGE_W;

  const pageNumbers: number[] = [];
  for (let n = 1; n <= doc.numPages; n++) pageNumbers.push(n);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/5 px-3 text-xs">
        <span className="text-zinc-400">
          {doc.numPages} pages · <span data-qa="page">{page}</span>
        </span>
        <button
          className="rounded border border-white/10 px-1.5 text-zinc-300 hover:border-electric"
          onClick={() => applyZoom(zoom - 0.25)}
        >
          −
        </button>
        <span data-qa="zoom" className="text-zinc-500">{Math.round(zoom * 100)}%</span>
        <button
          className="rounded border border-white/10 px-1.5 text-zinc-300 hover:border-electric"
          onClick={() => applyZoom(zoom + 0.25)}
        >
          +
        </button>
        <span className="mx-2 h-4 w-px bg-white/10" />
        {(["highlight", "underline"] as const).map((t) => (
          <button
            key={t}
            data-qa={`tool-${t}`}
            onClick={() => setTool(t)}
            className={`rounded px-2 py-0.5 capitalize ${
              tool === t ? "bg-electric text-white" : "border border-white/10 text-zinc-400"
            }`}
          >
            {t}
          </button>
        ))}
        <button
          data-qa="export"
          className="rounded border border-white/10 px-2 py-0.5 text-zinc-300 hover:border-electric"
          onClick={onExport}
        >
          export
        </button>
        <button
          data-qa="clear"
          className="ml-auto rounded border border-white/10 px-2 py-0.5 text-zinc-500 hover:text-zinc-300"
          onClick={() => {
            clearSession();
            setAnnos([]);
          }}
        >
          reset session
        </button>
        <span data-qa="status" className="text-[10px] text-zinc-600">{status}</span>
      </div>
      <div ref={scroller} data-qa="scroller" className="flex-1 overflow-y-auto bg-zinc-900">
        <div className="mx-auto py-4" style={{ width: colW * zoom }}>
          {pageNumbers.map((n) => {
            const inWindow = Math.abs(n - page) <= WINDOW;
            if (!inWindow)
              return <div key={n} className={SLOT_CLS} style={{ width: dimFor(n).w * zoom, height: dimFor(n).h * zoom }} />;
            return (
              <PageView
                key={n}
                num={n}
                zoom={zoom}
                dim={dimFor(n)}
                register={(s) => slots.current.set(n, s)}
                overlayFor={overlayFor}
                onDown={onOverlayDown}
                onMove={onOverlayMove}
                onUp={onOverlayUp}
                drawOverlayFor={drawOverlayFor}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PageView({
  num,
  zoom,
  dim,
  register,
  overlayFor,
  onDown,
  onMove,
  onUp,
  drawOverlayFor,
}: {
  num: number;
  zoom: number;
  dim: { w: number; h: number };
  register: (s: PageSlot) => void;
  overlayFor: (n: number) => StoredAnnotation[];
  onDown: (e: React.MouseEvent<HTMLCanvasElement>, n: number) => void;
  onMove: (e: React.MouseEvent<HTMLCanvasElement>, n: number) => void;
  onUp: (n: number) => void;
  drawOverlayFor: (n: number, c: HTMLCanvasElement) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const slot = useRef<PageSlot>({ num });

  useEffect(() => {
    slot.current.canvas = canvasRef.current ?? undefined;
    slot.current.overlay = overlayRef.current ?? undefined;
    slot.current.renderedFor = undefined; // force render on mount
    register(slot.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // C1: size the overlay bitmap to the page box and re-size on zoom change.
  // A <canvas> is a replaced element — without this it stays at the 300x150
  // default no matter what CSS says (RENDER-SPEC C1). onSized lets the parent
  // repaint stored annotations onto the freshly sized bitmap.
  useLayoutEffect(() => {
    const c = overlayRef.current;
    if (!c) return;
    const k = dpr();
    c.width = Math.round(dim.w * zoom * k);
    c.height = Math.round(dim.h * zoom * k);
    drawOverlayFor(num, c); // paint stored annos onto the fresh bitmap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, dim.w, dim.h]); // dim: bitmap sized at fallback (pre-dims-load) MUST re-size
  // when real page geometry lands, else bitmap (letter) ≠ CSS box (A4) — the
  // "highlight raised a couple of lines" bug Tracy hit on the thesis doc.

  return (
    <div className={SLOT_CLS} style={{ width: dim.w * zoom, height: dim.h * zoom }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <canvas
        ref={overlayRef}
        data-qa={`overlay-${num}`}
        className="absolute inset-0 h-full w-full cursor-crosshair"
        onMouseDown={(e) => onDown(e, num)}
        onMouseMove={(e) => onMove(e, num)}
        onMouseUp={() => onUp(num)}
      />
      <span className="absolute -right-9 top-2 text-[10px] text-zinc-600">{num}</span>
      {overlayFor(num).length > 0 && (
        <span className="sr-only" data-qa={`annos-${num}`}>{overlayFor(num).length}</span>
      )}
    </div>
  );
}
