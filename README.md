# SolsticeDocs

Local-first macOS PDF workspace. Tauri 2 + React 19 + TypeScript + Tailwind (build-time) + Rust/SQLite.

**Local-first means zero network at runtime** — no CDN assets, no webfonts, no telemetry, no updater phone-home.

## Build from source (macOS)

Prerequisites:

- Node.js ≥ 20 (`node --version`)
- Rust via [rustup](https://rustup.rs) (`rustc --version`)
- Xcode Command Line Tools (`xcode-select -p`)

```sh
npm install
npm run tauri dev      # dev app, hot reload
npm run tauri build    # release .app bundle
```

## Project layout

- `src/` — React frontend (Tailwind, design tokens in `tailwind.config.js`)
- `src-tauri/` — Rust shell; window config in `src-tauri/tauri.conf.json`
- `docs/window-config.md` — why the window is configured the way it is

## Status

- **Phase 1 — shell init: done** (borderless window, draggable title bar, native traffic lights, design tokens, no-network stack)
- Phase 2 — Rust/SQLite storage core: not started
- Phase 3 — PDF render + annotation canvas + write path (L1): not started
