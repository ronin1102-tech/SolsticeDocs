// Phase 3-WRITE: any-PDF import (dialog), recent shelf (SQLite), asset-protocol open.
// Browser dev mode keeps the committed fixture as the default document (ADR-0001).
import { useEffect, useState } from "react";
import { openDoc, type Doc } from "./lib/pdf";
import { clearSession } from "./lib/store";
import { ipc, sourceUrlAsync, type DocState } from "./lib/ipc";
import Viewer from "./Viewer";

const FIXTURE = "test-fixtures/gen-1200.pdf"; // relative on purpose: bundled web asset, not an FS path
const IN_TAURI =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

export default function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filePath, setFilePath] = useState(FIXTURE);
  const [shelf, setShelf] = useState<DocState[]>([]);
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(location.search);
  const initialPage = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const initialZoom = Math.min(3, Math.max(0.5, parseFloat(params.get("zoom") || "1") || 1));

  const openPath = async (p: string) => {
    setErr(null);
    setDoc(null);
    try {
      const url = await sourceUrlAsync(p);
      setFilePath(p);
      setDoc(await openDoc(url));
    } catch (e) {
      setErr(String(e));
    }
  };

  useEffect(() => {
    openPath(FIXTURE);
    if (IN_TAURI) ipc.listDocuments().then(setShelf).catch(() => {});
  }, []);

  const onImport = async () => {
    setBusy(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const pick = await open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (typeof pick !== "string") return;
      const title = pick.split("/").pop() ?? pick;
      await ipc.importDocument(pick, title); // upsert by hash, hash off-thread
      setShelf(await ipc.listDocuments());
      await openPath(pick);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onOpenShelf = async (d: DocState) => {
    setBusy(true);
    try {
      await ipc.importDocument(d.file_path, d.title); // refresh updated_at for shelf order
      await openPath(d.file_path);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

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
          phase 3 · write
        </span>
        {IN_TAURI && (
          <button
            data-qa="import"
            onClick={onImport}
            disabled={busy}
            className="ml-4 rounded border border-electric/40 px-2 py-0.5 text-xs text-electric hover:border-electric disabled:opacity-40"
          >
            {busy ? "working…" : "import PDF"}
          </button>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-electric" />
          {IN_TAURI ? "STORAGE:NATIVE" : "STORAGE:BROWSER"}
        </span>
      </header>
      <main className="relative flex flex-1 overflow-hidden">
        {IN_TAURI && (
          <aside
            data-qa="shelf"
            className="w-48 shrink-0 overflow-y-auto border-r border-white/5 px-2 py-2"
          >
            <p className="px-1 pb-1 text-[10px] uppercase tracking-wider text-zinc-600">Recent</p>
            {shelf.map((d) => (
              <button
                key={d.hash_sha256}
                onClick={() => onOpenShelf(d)}
                className={`block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-white/5 ${
                  d.file_path === filePath ? "text-electric" : "text-zinc-400"
                }`}
                title={d.file_path}
              >
                {d.title || d.file_path.split("/").pop()}
              </button>
            ))}
            {shelf.length === 0 && (
              <p className="px-1 text-[10px] text-zinc-700">imported docs land here</p>
            )}
          </aside>
        )}
        <div className="relative flex-1 overflow-hidden">
          {err && (
            <div className="p-6">
              <p className="text-sm text-red-400">Failed to open: {err}</p>
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
          {!err && !doc && <p className="p-6 text-sm text-zinc-500">opening…</p>}
          {doc && (
            <Viewer
              doc={doc}
              filePath={filePath}
              initialPage={initialPage}
              initialZoom={initialZoom}
            />
          )}
        </div>
      </main>
    </div>
  );
}
