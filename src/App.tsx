import { useEffect, useState } from "react";
import { openDoc, type Doc } from "./lib/pdf";
import { clearSession } from "./lib/store";
import Viewer from "./Viewer";

export default function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const filePath = "/test-fixtures/gen-1200.pdf";
  // Deep link: ?page=N&zoom=Z (also the QA jump path)
  const params = new URLSearchParams(location.search);
  const initialPage = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const initialZoom = Math.min(3, Math.max(0.5, parseFloat(params.get("zoom") || "1") || 1));

  useEffect(() => {
    openDoc(filePath)
      .then(setDoc)
      .catch((e) => setErr(String(e)));
  }, [filePath]);

  const inTauri =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-obsidian font-sans text-zinc-200 select-none">
      <header
        data-tauri-drag-region
        className="flex h-10 shrink-0 items-center border-b border-white/5 bg-obsidian px-4"
      >
        <span
          data-tauri-drag-region
          className="text-xs font-semibold uppercase tracking-widest text-electric"
        >
          Solstice Docs
        </span>
        <span data-tauri-drag-region className="ml-3 text-[10px] text-zinc-600">
          phase 3 · render
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-electric" />
          {inTauri ? "STORAGE:NATIVE" : "STORAGE:BROWSER"}
        </span>
      </header>
      <main className="relative flex-1 overflow-hidden">
        {err && (
          <div className="p-6">
            <p className="text-sm text-red-400">Failed to open fixture: {err}</p>
            <button
              className="mt-3 rounded border border-white/10 px-2 py-1 text-xs text-zinc-400"
              onClick={() => {
                clearSession();
                location.reload();
              }}
            >
              clear session + reload
            </button>
          </div>
        )}
        {!err && !doc && <p className="p-6 text-sm text-zinc-500">opening fixture…</p>}
        {doc && <Viewer doc={doc} filePath={filePath} initialPage={initialPage} initialZoom={initialZoom} />}
      </main>
    </div>
  );
}
