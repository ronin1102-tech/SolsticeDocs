# Solstice Docs — Phase 3-WRITE Scope (import · native annotations · export)

Date: 2026-10-12 · Drafted by Cori from repo inspection · Status: AWAITING TRACY'S GO
Renders the promise in PHASE-3-STATE.md ("Chrome-only dev mode … native-mode persistence
swaps in at Phase 3-WRITE via ipc.addAnnotation") and Tracy's ask: load arbitrary PDFs,
edit them reliably.

## The product statement (one line)

Open any PDF from disk, annotate it, annotations live in SQLite and survive relaunch,
export a new PDF with annotations stamped in. Text-editing-the-file is NOT in v1 (see Parking lot).

## Named tech decisions (logged so they don't get re-derived)

1. **File pick:** `tauri-plugin-dialog` (official). Touches 4 files: `Cargo.toml`,
   `lib.rs` (plugin init), `capabilities/default.json`, `package.json`. One approval batch.
2. **Bytes to PDF.js:** asset protocol (`convertFileSrc`), enabled in `tauri.conf.json`
   with scope `$HOME/**` — user-picked files may live anywhere; the picker is the consent
   step. Streams + supports Range, so large PDFs behave. Fallback if Range misbehaves on
   fixture+real docs: one `read_document_bytes` command (whole-file through IPC). Decision
   point at verification, not before.
3. **Annotations storage:** dual-branch inside `store.ts` (the seam its header already
   promises). Tauri mode → existing `ipc.addAnnotation/listAnnotations` (SQLite, Phase-2
   core, benched). Browser mode → localStorage, unchanged. Same `Session` contract both
   sides; durable-on-stroke-end stays the contract (Tracy's pending call in v2.txt doesn't block).
4. **Export:** `pdf-lib` (MIT, npm, zero network — no-network rule holds). Stamps
   annotations into a cloned document and writes it. Our rects are already PDF user-space
   (bottom-left origin) — no coordinate conversion. Write-back via ONE small Rust command
   (`write_export_cmd`) rather than adding the fs plugin: keeps the plugin surface at one.
5. **Recent-docs shelf:** SQLite `documents` table exists; ONE small read command
   (`list_documents_cmd`) exposes it. v1 shelf = plain rows (title + last-page), no design pass.

## v1 job list (boring and complete — stop after)

1. Dialog plugin: Cargo dep + `lib.rs` init + capability `dialog:default` + npm pkg. Build passes.
2. Asset protocol: `tauri.conf.json` security scope `$HOME/**`; fixture still loads in browser mode.
3. Rust: `list_documents_cmd`, `write_export_cmd` (+ `cargo test` against temp DB, Phase-2 injectable pattern).
4. `App.tsx`: import button (picker → `ipc.importDocument`), recent shelf (list → open),
   `openDoc(convertFileSrc(path))`; hardcoded fixture path removed (fixture stays as a shelf row).
5. `store.ts`: native branch behind `IN_TAURI`; Viewer code unchanged (contract holds).
6. Export: "Export annotated PDF" button → pdf-lib clone + stamp + save dialog + write. Underline → line, highlight → filled rect, translucent.
7. Verify (DoD below), explicit-file commits per merge-unit, phase report in chat.

## Definition of done (the check Tracy runs)

- Pick a real PDF from anywhere in $HOME → it opens, windowing/zoom/deep-links work.
- Annotate → quit → relaunch → annotations and last-page restored from SQLite (badge: STORAGE:NATIVE).
- Export → open the produced file in Preview → highlights visibly stamped in.
- Browser-mode regression: `qa/evidence/scripts/docs-battery-v2.mjs` still 20/20 at :1420.
- `cargo test` green for the two new commands; zero new network-touching deps (lsof spot check).

## Cost-driver diagnosis (what burned past phases → the counter)

1. Plugin/config approval round-trips → ONE batched approval request at phase start, not per-file.
2. Native webview isn't Cori-drivable (no Playwright into WKWebView) → native QA splits:
   `cargo test` (Cori, automated) + a 5-step manual script for Tracy (has his hardware;
   today's stroke screenshot pattern). Chrome battery stays the regression gate.
3. Scope creep toward L2 text editing → hard line: v1 ends at export. L2 needs a font-subset
   answer first (parking lot).
4. Token budget (lean mode standing) → one pass against this spec; mid-build ideas go to v2.txt.

## Parking lot (mirrors v2.txt — additions marked +)

+ L2 in-place text edit behind an experimental flag — blocked on font-subset/encoding
  strategy; revisit only after export ships (already in v2.txt; now with the blocker named).
+ Sidecar HTTP shim (ADR-0001) — deferred: Chrome dev mode stays feature-frozen with
  localStorage (both branches persist, no data loss); native features exercised via `tauri dev`.
+ Thumbnails off-main-thread (already parked 2026-10-12).
+ Session JSON export/import (bridges browser↔native session data, only if Tracy ever asks).

## Verified / unverified with owners (at drafting time)

- VERIFIED (this inspection): dialog plugin absent; asset protocol absent; no list/export
  commands in db.rs; annotation+reading-state Rust commands EXIST and are wired through ipc.ts;
  cargo 1.99 present; capabilities/default.json exists (empty default).
- UNVERIFIED (owned at build): pdf-lib Range/streaming behavior with asset protocol (Cori,
  step 2 verification); export visual fidelity in Preview (Tracy, 30-second eyeball);
  20/20 battery hold post-wiring (Cori, DoD); native relaunch restore (Tracy script, DoD).

---
- **Target Executor:** Cori (implementation; Rust commands minimal, per lane rules)
- **QA Verifier:** Vesper (post-phase audit, read-only — per lane rules he never writes here)
- **Expected Artifact:** source code (frontend + 2 Rust commands) + this spec + phase report in chat

## Implementation note (added at close-out, 2026-10-12)

- **3 Rust commands, not 2:** native persist is a replace-all sync (session snapshot →
  clear + insert), because stored JS annotation ids are `Date.now()` — diffing against DB
  ids would be guesswork. `clear_annotations_cmd` added with its own scoped-delete test.
- **Export byte path = base64 through IPC** (spec's fallback option), not a second plugin:
  multi-MB PDFs cross once per export, chunked `String.fromCharCode` + `btoa`; no fs
  plugin, plugin surface stays at one (dialog).
- **Store contract kept:** `saveSession` stays synchronous; native sync is fire-and-forget
  behind the seam. Restore goes through new `loadSessionAsync` (SQLite first, LS fallback,
  both modes same `Session` shape). Viewer never learned about storage — spec held.
- **Compile-time registration proof:** `cargo test` builds the bin target (main.rs unittests
  ran), so `generate_handler!` registration of all new commands type-checks.

### Dev-mode addendum (2026-10-12, post-GO)

`tauri dev` on the Catalina webview produced a second, distinct failure (BOOT ERROR,
"The string did not match the expected pattern", react-dom_client prebundle) AFTER the
dev prebundle syntax was fixed — not reproducible via local jsc parse (newer JSC).
Sidestep: `npx tauri dev --no-dev-server` runs the app against the production `dist/`,
which is now jsc-verified parseable (build.rolldownOptions.transform.target=safari13 —
the build-side pin had been silently unenforced by Vite 8/Rolldown the same way dev was).
Dev iteration on Catalina = Chrome browser + battery; native checks = production-mode app.
ADR-0001 amendment candidate when Tracy calls it.

### Dev-flow flip (2026-10-12, final)

`tauri dev --no-dev-server` does NOT bypass the dev server on this CLI (beforeDevCommand
still runs vite dev) — Tracy's run proved it; the webview kept loading dev bytes.
Resolution: `build.beforeDevCommand` now runs `vite preview --port 4173 --strictPort` and
`devUrl` points at it — `tauri dev` (plain) serves the jsc-verified production bundle.
Catalina-native iteration = production bytes always; hot reload moved to Chrome/battery.
Also fixed pre-emptively (would have broken on first native use): origin-relative paths
(fixture) no longer routed through convertFileSrc; exportPdf fetches via sourceUrlAsync.

### Worker pin (2026-10-12, final)

Third Vite-8 transform surface found on Tracy's hardware run: the pdf.js worker. `?url`
raw assets bypass ALL pins (BOOT ERROR "Invalid character '#'" at Worker construction);
`?worker` bundling uses yet another Rolldown pass — pinned via `worker.rolldownOptions.
transform.target=safari13`. Final jsc sweep: 5/5 assets parse (worker verified as classic
script too). Rule of thumb this taught us: Vite 8 has FIVE separate syntax surfaces
(optimizeDeps, build, css, worker, legacy) — a pin on one says nothing about the others.
