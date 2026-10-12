// Solstice Docs — Phase 1 shell.
// The header is the custom draggable title bar: `titleBarStyle: "Overlay"`
// keeps the native traffic lights floating over it (see docs/window-config.md).
export default function App() {
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
          phase 1 · shell
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-electric" />
          local-first · no network
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-600">
          Workspace shell — storage (Phase 2) and render (Phase 3) land here.
        </p>
      </main>
    </div>
  );
}
