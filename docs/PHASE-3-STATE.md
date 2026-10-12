# SOLSTICE DOCS — CURRENT STATE (read this first in any new session)

Updated: 2026-10-12 ~6:30 PM · HEAD `9e20f5d` on `main`, clean, pushed
One-line: Phase 3-WRITE (import/annotate/persist/export) is BUILT and hardware-proven
through rendering; two manual QA checks + one deferred bug remain. Vesper handoff is written.

## Where things stand

- **Phase 3-WRITE feature-complete at `b139fc3`.** Import any PDF (dialog) → annotate →
  SQLite persist (replace-all sync) → export `(annotated).pdf` via pdf-lib. Rust 9/9,
  tsc clean, battery v2 20/20 **against the production bundle** (`:4173`/`:4174` — never
  trust the old dev-port :1420 results; five separate Vite-8 transform surfaces had to be
  pinned to safari13 for the Catalina engine: optimizeDeps, build, worker, builtins
  (core-js polyfill entries in `src/main.tsx` + `src/lib/pdf.worker.entry.ts`), asset scope).
- **Tracy-verified on hardware:** window mounts, import→shelf→SQLite row, worker runs,
  documents render, landscape decks render true at first paint.
- **PENDING — the two phase-gate checks (Tracy, ~5 min, next session):**
  1. highlight → quit app fully → relaunch → highlight + last page restored, badge STORAGE:NATIVE
  2. export → `<name> (annotated).pdf` beside the source → Preview shows the highlight stamp
  Both green = phase closes, Vesper audits (`docs/PHASE-3-WRITE-HANDOFF.md` is his brief).
- **DEFERRED-1 (owner: Cori, next pass, not a gate):** slide background graphics flatten to
  solid pink on the Catalina engine only (Chrome renders same doc fine). Suspected PDF.js
  image-decode path on Safari-14-class. Zero investigation beyond observation. May park
  upstream with thumbnails (v2.txt).

## Launch / verify commands (exact)

```bash
cd ~/SolsticeDocs && npx tauri dev     # rebuilds dist, serves :4173 (vite preview), opens app
node qa/evidence/scripts/docs-battery-v2.mjs   # edit BASE to :4173/:4174 first; needs playwright
cd src-tauri && cargo test             # 9 tests, ~1s warm
```

## Read-next (in order, only as needed)

1. `docs/PHASE-3-WRITE-HANDOFF.md` — full debugging chain (7 commits, one per Vite-8
   surface), honest verified/unverified split, audit pointers, jsc-sweep method
2. `docs/PHASE-3-WRITE-SPEC.md` — scope + implementation addenda (incl. why 3 Rust
   commands not 2; why tauri dev serves production bytes on this machine)
3. `docs/RENDER-SPEC.md` — viewer contracts C1/C1a/C2/C3 (+ per-page geometry note in git)

## Standing gotchas (paid for tonight — do not re-learn)

- Vite 8/Rolldown ignores esbuild-era `target` pins; EVERY transform surface needs its own
  safari13 pin. Never trust a pin you haven't parse-verified (`jsc` sweep of all dist assets,
  worker as classic script too). Parse-clean ≠ runtime-complete (builtins needed polyfills).
- `vite preview` serves dist/ ONLY — fetched assets must live in `public/` (repo-root files
  404 into index.html → "Invalid PDF structure").
- Absolute FS paths (`/Users/...`) go through convertFileSrc; relative paths are web assets
  (`src/lib/ipc.ts` `sourceUrlAsync` — this guard was inverted once already, cost an hour).
- Browser batteries must run against the mode the user runs (production), or they certify
  the wrong bytes. Proven: dev-mode 20/20 hid five production-only failures.

---

# DOCS-03-RENDER — State Handoff (mid-flight, NOT phase-complete)

> **CLOSE-OUT 2026-10-12 — supersede below (commit `ab19545`).** QA battery ran same day:
> scroll PASS (maxDrift 1, long-task max 220ms). Three defects found and FIXED — deep-link
> scroll, overlay 300×150 sizing, PDF-units contract — battery v2 **20/20**
> (`qa/evidence/docs-battery-v2-results.json`). Thumbnails parked to `v2.txt`.
> Spec: `docs/RENDER-SPEC.md`. NOT-VERIFIED items 1–3 below are now verified; the /__qa
> no-op note stands. Sections below kept as the pre-fix record.

Date: 2026-10-12 · Commit: `c0e2174` (WIP) · Reason: token budget — Tracy called it, handoff now.

## State: what exists and works

- **PDF.js rendering: WORKING.** `pdfjs-dist@4.10.38` legacy build (Safari-14-class syntax —
  required by the Catalina pins), worker bundled locally via `?url` import — zero network.
- **Windowed continuous scroll: WORKING.** Current page ±3 rendered, placeholders elsewhere.
  Verified in real browser: `?page=600` deep-link jump to a 1,200-page doc reports p600 instantly.
- **Fixture pipeline: WORKING.** `scripts/gen-fixture.py` — dependency-free deterministic PDF
  writer. `test-fixtures/gen-1200.pdf` (1,200 pages, 365KB) committed. No downloads at test time
  (Vesper requirement).
- **Annotation overlay: code-complete.** Band highlighter + underline, PDF-units coordinate
  storage (`rects: [x,y,w,h]`, bottom-left origin), durable-on-stroke-end persistence contract
  through `store.ts` (localStorage in browser mode; SQLite swap-in behind the same functions).
- **Persistence layer: code-complete.** `session.v1` key: lastPage/zoom/annotations. Deep links
  `?page=N&zoom=Z`. `data-qa` hooks: page/zoom/status/scroller/overlay-N/tool-*/clear.

## Verified vs NOT verified

VERIFIED (real browser, this session): build clean; 1,200p opens; instant p600 jump (windowing);
page indicator tracks.

NOT VERIFIED (next session, ~10 min):
1. **Annotation → persist → reload.** Click on overlay-600 was the last action before this
   handoff; the stroke→localStorage→reload path is unproven. Battery: navigate
   `?qa=1&page=600` → click/drag overlay → note `[data-qa="page"]`, reload same URL →
   annotation count restored, page = 600.
2. **Autoscroll perf.** No wheel driver in the agent browser — needs Playwright `mouse.wheel`
   or a human scroll. Pass bar: scroll 1,200→1 deep, no long-task jank, page indicator tracks.
3. **Zoom round-trip** (`?zoom=1.5`, re-render at new scale, persist).

## Known gaps (deliberate, not bugs)

- `qaPost("/__qa")` events no-op under plain vite (no route). DOM reads were used instead. If
  wanted later: a 10-line vite middleware plugin. Parked — `v2.txt`.
- PDF.js renders text but this fixture has no selectable-text layer work (v1 bands, not glyph
  hit-testing). Underline = band underline. Parking lot for WRITE phase.
- Thumbnails off-main-thread: NOT started (brief item). Windowing first; thumbnails next session.
- Chrome-only dev mode (ADR-0001) — all evidence above is Chrome-path; native-mode persistence
  swaps in at Phase 3-WRITE via `ipc.addAnnotation`.

## Next session: 3 steps to close the phase

1. Run the 3-item NOT-VERIFIED battery (Playwright script or Tracy manual scroll).
2. Thumbnails (async, off main thread) if budget allows — else it moves to v2.txt and the phase
   closes without it, documented.
3. `qa/` evidence file + phase report + commit + push. Vesper audits after WRITE, not now.

Lane rules unchanged: commit before self-edit, push per phase, per-edit approval hard.
