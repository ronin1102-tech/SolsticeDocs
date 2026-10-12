// DOCS-03-RENDER: windowed continuous scroll (±3 pages), overlay annotation
// canvas, durable-on-stroke-end persistence via store.ts.
import { useEffect, useRef, useState } from "react";
import { renderPageToCanvas, PAGE_W, PAGE_H, type Doc } from "./lib/pdf";
import {
  loadSession,
  saveSession,
  clearSession,
  qaPost,
  type StoredAnnotation,
} from "./lib/store";

const WINDOW = 3; // render current ±3
const TOOL_COLORS: Record<string, string> = { highlight: "#FDE047", underline: "#3B82F6" };

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

  // --- open restore ---
  useEffect(() => {
    const s = loadSession();
    if (s && s.filePath === filePath) {
      setZoom(s.zoom);
      setPage(s.lastPage);
      setAnnos(s.annotations);
      setStatus(`restored p${s.lastPage}`);
    }
  }, [filePath]);

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
      const h = PAGE_H * zoom;
      const p = Math.min(doc.numPages, Math.max(1, Math.round(container.scrollTop / h) + 1));
      if (p !== page) {
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

  useEffect(() => {
    // redraw overlays whenever annos or zoom change
    for (const [n, slot] of slots.current) {
      if (!slot.overlay) continue;
      const c = slot.overlay;
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      const k = c.width / (PAGE_W * zoom);
      ctx.clearRect(0, 0, c.width, c.height);
      for (const a of overlayFor(n)) {
        ctx.fillStyle = a.color + "55"; // translucent fill
        ctx.strokeStyle = a.color;
        ctx.lineWidth = Math.max(1, 2 * k);
        for (const [x, y, w, h] of a.rects) {
          const rx = x * zoom * k;
          const ry = (PAGE_H - y - h) * zoom * k; // PDF origin bottom-left → canvas top-left
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annos, zoom, page]);

  // --- mouse → PDF-units rect collection (horizontal bands; good enough v1) ---
  const onOverlayDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    curRects.current = [];
    record(e);
  };
  const onOverlayMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawing.current) record(e);
  };
  const record = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * PAGE_W;
    const h = 14; // band height in PDF units
    const yTop = ((e.clientY - r.top) / r.height) * PAGE_H;
    const y = PAGE_H - yTop - h; // store as PDF-units bottom-left origin
    const rects = curRects.current;
    const last = rects[rects.length - 1];
    if (last && Math.abs(last[1] - y) < h * 0.6) {
      // merge into current band
      last[0] = Math.min(last[0], x);
      last[2] = Math.max(last[2], Math.abs(x - last[0]) + 1);
    } else {
      rects.push([Math.min(x, PAGE_W - 10), y, 10, h]);
    }
    drawLive(c);
  };
  const drawLive = (c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const k = c.width / (PAGE_W * zoom);
    const color = TOOL_COLORS[tool];
    ctx.fillStyle = color + "55";
    ctx.strokeStyle = color;
    for (const [x, y, w, h] of curRects.current) {
      const rx = x * zoom * k;
      const ry = (PAGE_H - y - h) * zoom * k;
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
        <div className="mx-auto py-4" style={{ width: PAGE_W * zoom }}>
          {pageNumbers.map((n) => {
            const inWindow = Math.abs(n - page) <= WINDOW;
            if (!inWindow) return <div key={n} style={{ height: PAGE_H * zoom }} />;
            return (
              <PageView
                key={n}
                num={n}
                zoom={zoom}
                register={(s) => slots.current.set(n, s)}
                overlayFor={overlayFor}
                onDown={onOverlayDown}
                onMove={onOverlayMove}
                onUp={onOverlayUp}
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
  register,
  overlayFor,
  onDown,
  onMove,
  onUp,
}: {
  num: number;
  zoom: number;
  register: (s: PageSlot) => void;
  overlayFor: (n: number) => StoredAnnotation[];
  onDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onUp: (n: number) => void;
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

  return (
    <div className="relative mb-4 bg-white shadow-lg" style={{ height: PAGE_H * zoom }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <canvas
        ref={overlayRef}
        data-qa={`overlay-${num}`}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={(e) => onDown(e)}
        onMouseMove={(e) => onMove(e)}
        onMouseUp={() => onUp(num)}
      />
      <span className="absolute -right-9 top-2 text-[10px] text-zinc-600">{num}</span>
      {overlayFor(num).length > 0 && (
        <span className="sr-only" data-qa={`annos-${num}`}>{overlayFor(num).length}</span>
      )}
    </div>
  );
}
