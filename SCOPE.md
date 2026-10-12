> **ALIGNMENT 2026-10-12:** Dev renderer = Chrome per docs/ADR-0001-chrome-dev.md (Catalina webview quarantined, upstream wry#1678). Window-config visual checks deferred to newer macOS / release build. Phase-2 spec below unchanged otherwise.

# Solstice Docs — Phase 1 Scope (DOCS-01-INIT)

Date: 2026-10-12 · Drafted by Cori from Vesper's brief + repo inspection · Status: AWAITING TRACY'S GO

## Resolved by inspection (verified this session)

| Question | Finding |
|---|---|
| Where it lives | `/Users/onemoretimetrizzy/Solstice Docs` — existing repo, remote `github.com/ronin1102-tech/Solstice-Docs`. The brief's `~/Projects/SolsticeDocs/` does not exist; reality supersedes the brief. |
| State | Greenfield. 2 commits (both "first commit"), clean tree, README is a doubled title stub. Nothing in flight → fresh build, not a state handoff. |
| Toolchain | Node v20.20.2 ✅ · npm 10.8.2 ✅ · Homebrew 6.0.16 ✅ · Xcode CLT ✅ · 50 GB free ✅ · **Rust: NOT INSTALLED** (no rustc, no cargo, no rustup anywhere) |
| Path gotcha | Directory name contains a space. Modern cargo/Vite handle it; every script must quote. Decision needed (below). |

## Named tech decisions (logged so they don't get re-derived mid-build)

1. **Tailwind 3.x, not 4.** The brief pins tokens in `tailwind.config.js` — that's the v3 config-file pattern. v4 is CSS-first and would fight the spec.
2. **React 19 + TypeScript + Vite** as the Tauri frontend template.
3. **Window config (macOS):** `titleBarStyle: "Overlay"` + `hiddenTitle: true` on the Tauri window → native traffic lights float over our custom draggable title bar (`data-tauri-drag-region`). No fake traffic lights.
4. **No-network:** no CDN links, fonts = system stack (no Google Fonts), no updater plugin enabled, no telemetry config. Verified later with `lsof`/`nettop` on the running pids.

## v1 job list (Phase 1 only — stop after, per lane rules)

1. Install Rust via rustup (pending approval — machine-level install).
2. Scaffold Tauri 2.x + React 19 + TS + Tailwind 3 in the repo root.
3. `tauri.conf.json`: borderless window, embedded traffic lights, documented in `docs/window-config.md`.
4. `tailwind.config.js`: `obsidian #0A0B0E`, `electric #3B82F6` tokens, compiled at build time.
5. Updater + telemetry disabled/absent; index.html free of network references.
6. Verify: `npm run tauri dev` → window launches, drag works, traffic lights render, zero outbound requests (evidence captured), tokens present in built CSS.
7. Commit (explicit-file staging), hash noted.

## Definition of done

- Borderless window launches via `npm run tauri dev` on the Mac.
- Draggable title bar works; native traffic lights render.
- Zero runtime network requests — evidence from a real check, not assertion.
- `#0A0B0E` / `#3B82F6` appear in compiled CSS.
- Commit hash recorded in the phase report (in chat, per workflow).

## Cost-driver diagnosis (what burned tokens on past builds → mitigations here)

- Multi-round batteries re-carry the full conversation (~3.7M tokens/pass on the grammar build). **Mitigation:** Phase 1 is deliberately small — one pass, no iterate-test loops; batteries come later.
- Toolchain gaps discovered mid-build cost a round-trip. **Mitigation:** Rust gap surfaced now, decided before build.
- Scope creep mid-build. **Mitigation:** parking lot below; mid-build ideas go to `v2.txt`, not the build.

## Parking lot (`v2.txt`, beside this file)

L2 in-place text edit · L3 reflow/page ops/merge · native Pdfium renderer · FTS5 search · 35MB-idle revisit · highlight-queue recovery contract (Tracy's call pending)

## Verified / Unverified — with owners

- **VERIFIED (this session):** repo state, greenfield, Node/brew/CLT versions, disk, Rust absence.
- **UNVERIFIED → my verify step:** window launch, drag, traffic lights, zero-network, tokens-in-CSS. Owner: Cori, DOCS-01 step 6.
- **UNVERIFIED → Tracy:** 35MB vs 120MB interim gate; 20ms FTS5 vs 150ms p50 interim; highlight-queue contract. Flagged by Vesper, yours to settle.
- **Vesper audit:** after Phase 3, per brief. Not before.

## Decisions I need from you before writing anything

1. **Go on this scope?**
2. **Rust install:** `curl rustup.rs` → rustup toolchain for user `onemoretimetrizzy`. OK?
3. **Path:** keep `Solstice Docs` (space, quoted everywhere) or rename to `SolsticeDocs`? My rec: keep, quote rigorously — rename churns remote/README for zero functional gain.
4. **Push policy:** local commits until Vesper's post-Phase-3 audit, or push per phase?

## Lane rules restated (from brief, binding)

Commit before every self-edit. Per-edit human approval stays hard for this project — propose, wait, write (brief supersedes my 2026-10-02 standing self-code authorization here; it says so explicitly). Claude doesn't touch this codebase. Vesper reviews, never writes.
