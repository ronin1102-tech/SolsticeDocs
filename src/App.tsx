// Solstice Docs — Phase 2 shell: header + storage status card (exercises the
// ADR-0001 ipc seam: shows STORAGE:NATIVE in-app, STORAGE:BROWSER in Chrome).
export default function App() {
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
          phase 2 · storage core
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-electric" />
          local-first · no network
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 text-sm">
          <p className="text-zinc-400">
            SQLite core (rusqlite · WAL · user_version migrations) — exercised by
            <span className="text-electric"> cargo test</span> evidence.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            IPC transport:{" "}
            <span className="text-electric">
              {inTauri ? "STORAGE:NATIVE (tauri invoke)" : "STORAGE:BROWSER (shim — sidecar lands Phase 3)"}
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
