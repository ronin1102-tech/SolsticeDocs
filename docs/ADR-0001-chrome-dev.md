# ADR-0001 — Develop against Chrome; Tauri webview quarantined on Catalina

Date: 2026-10-12 · Status: ACCEPTED (Tracy's call) · Supersedes: nothing

## Context

Phase 1 delivered a shell that launches but renders white in the Catalina WKWebView:

1. **Solved:** objc2 debug-assertion crash at window creation (tauri#15431) — fixed via
   `[profile.dev.package.objc2] debug-assertions = false`.
2. **Solved:** Vite 8 default target safari16.4 vs Safari-14.1-class webview — fixed via
   `target: safari14` everywhere in vite.config.ts. Bundle verified clean; renders perfectly
   in Chrome from the same dev server.
3. **Unsolved, quarantined:** the webview still renders pure white. Inline JS never executes
   (a boot-trap script whose first line paints the window dark never ran). WebContent process
   logs `SkyLight: 0 is not a valid connection ID`. Safari's Develop menu shows no inspectable
   webview (Tracy, 2026-10-12). Same disease as (1): wry/tao call unguarded WKWebView APIs on
   old macOS (wry#1678 — fix PR still open). This is upstream, not our config.

## Decision

- **Dev renderer = Chrome** at `http://localhost:1420` (`npm run dev`).
- **Rust/Tauri stays the backend.** All phases 2–3 Rust work (SQLite, IPC, PDF write) is
  unaffected and continues under Tauri.
- **IPC seam rule (enforced from Phase 2):** every Tauri call goes through `src/lib/ipc.ts`.
  Native `invoke()` when running inside Tauri; HTTP shim to the Rust side when running in a
  plain browser. UI code never imports `@tauri-apps/*` directly.

## Consequences

- Window-config verification (drag region, traffic lights) is deferred to a newer macOS
  machine, a `tauri build` release test, or upstream fixing #1678. Unverified with owner: Tracy.
- `npm run tauri dev` remains usable for Rust compile checks; visual QA happens in Chrome.
- If Vesper's audit needs the native window, that's a newer-Mac item, flagged now not at audit.
