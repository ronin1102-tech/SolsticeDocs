# DOCS-03-RENDER — State Handoff (mid-flight, NOT phase-complete)

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
