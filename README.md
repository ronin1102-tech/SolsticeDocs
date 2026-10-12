# SolsticeDocs

Local-first macOS PDF workspace. Tauri 2 + React 19 + TypeScript + Tailwind (build-time) + Rust/SQLite.

**Local-first means zero network at runtime** — no CDN assets, no webfonts, no telemetry, no updater phone-home.

## Development mode (read this first)

Per [ADR-0001](docs/ADR-0001-chrome-dev.md): on the Catalina build machine the Tauri webview
renders white (upstream wry#1678), so development runs against Chrome:

```sh
npm run dev          # vite → http://localhost:1420 → open in Chrome
npm run tauri dev    # Rust shell + compile checks (window will be white on 10.15)
npm run tauri build  # release bundle (verification on newer macOS)
```

All Tauri IPC goes through `src/lib/ipc.ts` — native `invoke` inside the app, HTTP shim in the
browser. UI code never imports `@tauri-apps/*` directly.

## Build from source (macOS)

Prerequisites: Node ≥ 20 · Rust via [rustup](https://rustup.rs) · Xcode CLT.

Catalina (10.15) pins already applied — do not remove while 10.15 is a target:

- `src-tauri/Cargo.toml`: `[profile.dev.package.objc2] debug-assertions = false` (tauri#15431)
- `vite.config.ts`: every transform target pinned to `safari14`

## Layout

- `src/` — React frontend (tokens in `tailwind.config.js`; IPC seam in `src/lib/ipc.ts`)
- `src-tauri/` — Rust shell + storage core (`db.rs`, migrations)
- `docs/` — ADR-0001, window config decision record, phase reports
- `qa/` — test evidence (net/perf/crash) added at phase gates

## Status

- **Phase 1 — shell init: done** (Chrome-verified; native window behavior deferred per ADR-0001)
- **Phase 2 — Rust/SQLite storage core: done** (rusqlite bundled, WAL, user_version migrations,
  documents/annotations/coursework tables, IPC commands with p50/p95 bench, async SHA-256 import)
- Phase 3 — PDF render + annotation canvas + write path (L1): not started
