> **ALIGNMENT 2026-10-12:** Verified in Chrome only; native window behavior (drag, traffic lights) UNVERIFIED on this machine per ADR-0001 — owner: Tracy (newer macOS or `tauri build` release test).

# Window configuration — SolsticeDocs (Phase 1)

Decision record for `src-tauri/tauri.conf.json` → `app.windows[0]`.

## What was chosen

```json
{
  "title": "SolsticeDocs",
  "width": 1280,
  "height": 800,
  "minWidth": 960,
  "minHeight": 600,
  "titleBarStyle": "Overlay",
  "hiddenTitle": true
}
```

## Why

- **`titleBarStyle: "Overlay"`** — the native macOS traffic lights stay visible
  and float *over* the web content, while the standard title bar chrome is
  removed. This is what the brief calls "embedded traffic lights": real system
  buttons (close/minimize/zoom behave natively, including Option-click and
  accessibility), not webview-drawn imitations.
- **`hiddenTitle: true`** — with Overlay, the window title text would otherwise
  render inside the bar area; our React header replaces it.
- **Drag region** — the `<header>` in `src/App.tsx` carries
  `data-tauri-drag-region`. Every element inside it that should drag carries
  the attribute too (drag regions don't inherit to children). Text selection is
  disabled app-wide (`select-none`) so dragging doesn't fight selection.
- **1280×800, min 960×600** — PDF workspace sizing; a two-page spread at 100%
  needs ~1100px. Floor exists because the Phase 3 virtualized scroll assumes a
  sane minimum viewport.
- **No `decorations: false`** — that nukes the traffic lights entirely; Overlay
  is the "borderless look, native controls" option.

## What is intentionally absent (local-first)

- No updater plugin (nothing registered in `src-tauri/src/lib.rs` → nothing to
  phone home).
- No telemetry in the stack (Tauri 2 has none by default; none added).
- No webfonts — Tailwind `font-sans` resolves to the macOS system stack.
- No CDN references anywhere in `index.html`; favicon is a `data:` URI so even
  the favicon request never happens.

## CSP

`security.csp` is `null` for Phase 1 dev. Before Phase 3 sign-off this should
become a strict `default-src 'self'` policy — parked in `v2.txt`.
