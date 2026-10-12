# PHASE-3-WRITE — Vesper Handoff (state handoff, phase-complete-pending-manual-QA)

Date: 2026-10-12 · HEAD `b139fc3` on `main`, clean tree, pushed · Author: Cori
Audience: Vesper (QA/audit — read-only, per lane rules he never writes to this repo)

## What this phase delivered (scope: docs/PHASE-3-WRITE-SPEC.md)

Import any PDF → annotate → persist to SQLite → export stamped PDF. On the Catalina
Mac (the real constraint, ADR-0001), as of tonight, verified by Tracy's hardware runs:

- **WORKS (Tracy-observed on hardware):** app window mounts (production bytes), import
  button + picker, SQLite registration (shelf row appears), PDF.js worker executes,
  document renders, landscape slide decks render in true boxes at first paint (geometry
  fix `b139fc3` confirmed by his 6:14 PM screenshot).
- **PENDING Tracy's manual QA (the two phase-gate checks):**
  1. highlight → quit → relaunch → restored from SQLite (STORAGE:NATIVE)
  2. export → `(annotated).pdf` next to source → opens in Preview with stamp
  He is driving to work (overnight shift); checks land next session. NOT DONE YET — do
  not mark the phase closed on these.

## The debugging chain (why 7 fix commits exist for one feature) — each layer DISTINCT

Vite 8 (Rolldown) silently ignores the Catalina syntax pins ADR-0001 relied on, across
FIVE separate transform surfaces. Each surfaced as a different Tracy-hardware failure:

| # | Layer | Symptom on hardware | Fix / commit |
|---|---|---|---|
| 1 | dev prebundles | black window, `Unexpected token '='` | optimizeDeps rolldown target safari13 · `ed15723` |
| 2 | build chunks | (found by sweep — would have broken `tauri build`) | build rolldown target safari13 · `b9c3ddf` |
| 3 | worker (?url asset) | BOOT ERROR `Invalid character '#'` | `?worker` + worker rolldown pin · `1c2a62a` |
| 4 | builtins (.at/hasOwn/structuredClone) | `t.at is not a function` at runtime | core-js polyfill entries, page + worker · `4a8cbd5` |
| 5 | preview scope + path guard | `InvalidPDF structure` (fetch got index.html) | fixture → public/ · guard inversion fix · `ad936f6`+`2e834d7` |
| 6 | portrait-only geometry | landscape slides sheared; "scroll fixes it" | per-page dims + variable pitch · `b139fc3` |

jcs-verification method (new, reusable): the macOS JavaScriptCore CLI
(`/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc`)
is the same engine class as the failing webview — curl every dist asset and parse it
there BEFORE asking Tracy to relaunch. Proven on layers 1–3+5; note its limit: newer
JSC has newer builtins, so parse-clean ≠ runtime-complete (layer 4 needed hardware).

## Verification state (honest split)

VERIFIED (Cori, this session): `cargo test` 9/9 · tsc clean · production build OK ·
jsc parse sweep 5/5 dist assets (worker tested as classic script) · battery v2 **20/20
against the production bundle** on :4174 (the mode the app actually runs — earlier
20/20s were dev-mode, which is why they missed layers 2–5; fidelity rule learned).
VERIFIED (Tracy, hardware): window mounts, import→shelf→render→landscape geometry.
UNVERIFIED (owners): the 2 manual QA checks above (Tracy, next session) · pink-block
rendering fidelity (below) · native export byte-write (code-reviewed only).

## DEFERRED-1: slide background renders as solid pink block (next pass, not a gate)

Tracy's Module-1 deck (landscape, 9 pages): text/typography render correctly; the
slides' large background graphic flattens to a solid magenta block. Facts gathered:
happens on the Catalina engine only (same doc renders fully in Chrome battery mode);
appears to be a PDF.js rendering-fidelity gap in the legacy build on old engines
(image/XObject decode path suspected — NOT yet investigated; zero work done beyond
observation). Next pass: reproduce against :4174 in a profile that emulates the
constraint, check pdf.js issue tracker for Safari-14-class image bugs, consider
`pdfjs-dist` version pin bump or canvas-backend flags. Owner: Cori. Parked in v2.txt
alongside thumbnails if it turns out to be upstream.

## Audit notes for Vesper (where to look, what to flag)

- Highest-risk new code: `src/lib/store.ts` native branch (replace-all annotation sync
  — design note in the commit for `clear_annotations_cmd`) and `src/lib/exportPdf.ts`
  (coordinate mapping is page-dim aware but untested against rotated pages at export).
- `write_export_cmd` writes next to source with collision-avoiding names (tested);
  source must exist; 200MB cap (tested). No fs plugin — plugin surface = dialog only.
- `beforeDevCommand` = `npm run build && vite preview :4173` — Catalina native runs
  production bytes by design now (spec addendum "Dev-flow flip"). ADR-0001 amendment
  candidate: this supersedes "develop against Chrome" for native runs.
- Battery scripts live in `qa/evidence/scripts/` (replayable); battery must run against
  :4173/:4174 (production), not the old :1420 dev port — scripts' BASE constant is the
  only edit needed.
- Known noise, not defects: unused-var cargo warning in bench_ipc (`path`); vite
  esbuildOptions deprecation warning (our safari14 esbuild pins are the deprecated-but-
  harmless path; rolldown pins are the operative ones now).

## Lane state

Tracy drove to work mid-handoff (overnight shift, 6:30 PM drive). Manual QA lands next
session; DEFERRED-1 investigation is the follow-up work item; Vesper audit can proceed
on everything code-side now — please hold the phase-close verdict until the 2 manual
checks land. Everything is at `b139fc3`, pushed, clean.
