# DOCS-01-INIT — Phase Report

Date: 2026-10-12 · Executor: Cori · Branch: main · Status: COMPLETE (pending Tracy's visual check)

## Commit chain

- `5308ace` — scaffold (Tauri 2 + React 19 + TS, create-tauri-app react-ts template, unmodified)
- `3f38e22` — Phase 1 build (window config, tokens, no-network stack, Catalina workaround)
- `a73195c` — track Cargo.lock
- `4ec0ceb` — merge with remote rename commit `23ba6c0` (unrelated histories; remote was a
  re-initialized README stub, local full README kept, nothing lost)

Pushed to `github.com/ronin1102-tech/Solstice-Docs` @ `4ec0ceb`.

## Verified this session (evidence in chat log)

| Check | Method | Result |
|---|---|---|
| Window launches | `tauri dev`, log `Finished dev profile` + `Running target/debug/solstice-docs` | ✅ pid 36259, stable 4m+ (pre-fix crash died in ~2s) |
| Tokens in compiled CSS | grep on `dist/assets/*.css` | ✅ `bg-obsidian{background-color:rgb(10 11 14)}` + `#3b82f6` |
| Zero outbound network | `lsof -i` scoped to app pid **+ WebKit XPC helpers (Networking/WebContent)** — first pass scoped to the app pid only; WebKit does webview networking in a separate XPC process | ✅ webview helpers hold only a loopback socket to the dev server; zero non-loopback sockets |
| Frontend builds | `npm run build` (tsc + vite) | ✅ 16 modules, clean |
| Catalina crash fixed | before/after launch logs | ✅ without `[profile.dev.package.objc2] debug-assertions=false`: abort at window creation; with it: stable |

## Unverified — needs Tracy's eyes (app is still running)

1. **Drag the title bar** — grab the header area, drag the window. Drag region is the full header strip.
2. **Traffic lights** — native close/minimize/zoom should float over the header, top-left.

If both look right, DOCS-01 is fully done and DOCS-02 (Rust SQLite core) is next on your go.

## The blocker that mattered: macOS 10.15 Catalina

This Mac is a mid-2012 MacBook Pro on Catalina 10.15.7 (last supported OS). Current Tauri 2
crashes at window creation on Catalina in **dev builds**: objc2's debug assertion panics because
wry registers `WKNavigationDelegate.didBecomeDownload` (macOS 11.3+) that Catalina's WebKit lacks.
Tracked upstream, open: tauri-apps/tauri#15431 (+ wry#1678), docs still claim "10.15+".

**Workaround shipped** (`src-tauri/Cargo.toml`): `[profile.dev.package.objc2] debug-assertions =
false`. Maintainer-endorsed pattern (same class of bug closed via wry#1781). Dev-only — release
builds never had the assertion. The unimplemented delegate method is never invoked by a
local-first PDF app. Remove if 10.15 support is ever dropped.

## Carry-forwards

- v1 hard gates still pending Tracy's call: 35MB→120MB interim (memory), 20ms→150ms p50 (FTS5),
  highlight-queue contract.
- CSP strict `default-src 'self'` before Phase 3 sign-off — in `v2.txt`.
- DOCS-02 scope is already written (Vesper brief); will re-run scope-first gate briefly since
  the environment changed (Catalina pin now known).
