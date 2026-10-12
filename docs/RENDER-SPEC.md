# RENDER-SPEC — windowed viewer, overlay annotations, session restore

Status: spec written 2026-10-12, implementation in progress (same session).
Applies to: `src/Viewer.tsx` (all fixes), `src/App.tsx` (context only, no change planned).
Defect evidence: `qa/evidence/2026-10-12-CLOSEOUT.md` (battery run against tree `74af5a8`).

## Why this spec exists

The close-out battery proved three defects from one structural cause: `<canvas>` with
`absolute inset-0` does not size a replaced element — every overlay canvas rendered at its
300×150 default. Consequences: strokes dropped outside the top-left 300×150 of each page,
`rects` stored as zoom-squashed CSS pixels (units contract broken), deep links never
scrolled the viewport, restored annotations painted outside the bitmap.

## Contracts

### C1 — Overlay canvas geometry
The annotation `<canvas>` is a page-sized bitmap, CSS-sized to the page box:
- Bitmap: `width = round(PAGE_W · zoom · dpr)`, `height = round(PAGE_H · zoom · dpr)` (dpr cap 2 per `pdf.ts`).
- CSS: `width: 100%; height: 100%` of the page `<div>` (which is `PAGE_W·zoom` wide, `PAGE_H·zoom` tall).
- No replaced-element may rely on `inset-0` alone for sizing. Re-sizing on zoom change must
  not depend on the page-canvas render path (`renderedFor` guard applies to rendering, not sizing).

### C1a — Annotation units (restated from `store.ts`)
`rects: [x, y, w, h]` in PDF units (612×792 space, origin bottom-left, page-local).
`record()` converts via the overlay's `getBoundingClientRect()`; with C1 the overlay fills
the page box, so conversion is zoom-independent and round-trips through redraw math
`(PAGE_H − y − h)`. Merge branch must not shrink a band: `x2 = max(last.x + last.w, x)`,
`w = x2 − last.x`.

### C2 — Initial scroll (deep link and restore)
Whatever sets `page` at mount (deep link via `App.tsx` props, or `loadSession()` restore)
moves the viewport synchronously before paint: `useLayoutEffect` →
`scroller.scrollTop = scroller.children[page − 1].offsetTop − 4`.
DOM offsets are used (not computed pitch), so the mechanism is immune to margin asymmetries.
Slots are always all in DOM (1,200 children incl. placeholders — geometry probe), so offsets
exist on first layout. `useLayoutEffect` over `useEffect`: at 474k px depth an after-paint
scroll paints p1 first, fires a spurious scroll event, then jumps — flash plus churn.

### C3 — Uniform slot pitch
Placeholder and rendered slots share one box: same classes, `mb-4` on both, or neither —
decided at implementation, one shared constant. Pitch becomes uniformly `PAGE_H·zoom + 16`,
making the existing `Math.round(scrollTop / pitch) + 1` page math exact at every depth.
(Pre-fix geometry: pitch alternated 792/808 depending on window membership.)

### Rejected alternatives
- **Viewport-relative page detection** (DOM binary search under viewport center): second
  page-derivation mechanism to keep in sync; C2+C3 make it redundant.
- **Self-correcting onScroll** (if computed p ≠ state, scroll to center p): writes to
  scrollTop inside the scroll handler — loop risk, zero accuracy gain once pitch is uniform.
- **QA-only `p600Display` prop**: unnecessary once C2 fires on mount with doc loaded.
- **qaPost("pagestate") beacon**: extra API surface; battery reads DOM directly. Not built.

## Test map (battery: `qa/evidence/scripts/docs-closeout-battery.mjs`)

| Check | Contract | Pre-fix (2026-10-12 run) | Post-fix expectation |
|---|---|---|---|
| T0 indicator=600 | C2, C3 | FAIL (viewport stayed p1) | PASS |
| T0 viewport-at-600 (bbox y) | C2 | FAIL (y=474,548) | superseded: T0' `abs(ind − truePage) ≤ 1`, DOM truth (battery v2) |
| T1 stroke → LS → reload → pixel | C1, C1a | FAIL | PASS live + reload |
| T2 zoom round-trip + rescale pixel | C1, C1a | FAIL (paint transparent) | PASS |
| T3 deep scroll drift, settled | C2, C3 | PASS (maxDrift 1) | stays ≤ 1 |
| T3 long-task max | — | PASS (243ms) | stays < 300ms |
| T3' pitch uniformity (new) | C3 | not checked | identical for slots 1, 2, 100, 600, 1200 |
| T4 restore beats deep link (new) | C2 | not checked | restored p3 over `?page=1` |
| Fling-peak drift (report-only) | C3 | +8/+24 observed pre-fix | report, no hard bar (driver-dependent) |

## Fix list (all in Viewer.tsx)

1. C1 — overlay bitmap + CSS sizing in PageView, re-run on zoom change.
2. C2 — `useLayoutEffect` mount scroll to `children[page−1].offsetTop − 4`.
3. C3 — shared slot box classes (uniform pitch).
4. C1a — band-merge right-edge fix in `record()`.

## Verification plan

Re-run the committed battery (T0/T1/T2 flip to PASS, T3 stays PASS, plus T3'/T4 additions),
then explicit-file commit; commit body carries verified/deferred with owners. No probe
files left outside `.scratch/`; `.scratch/` probes deleted same session and tree re-listed.
