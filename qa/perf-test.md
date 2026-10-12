# qa/perf-test.md — DOCS-02 timing evidence

Date: 2026-10-12 · Machine: MacBookPro9,2 (2012, i5, Catalina 10.15.7) · Method: `cargo test bench -- --nocapture`

## Command

```sh
cd src-tauri && cargo test bench -- --nocapture
```

## Raw output

```
BENCH 100 samples | reading_state p50=339us p95=878us | annotation_insert p50=420us p95=1195us
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 5 filtered out
```

## Correctness battery (same session)

```
test db::tests::sha256_matches_known_vector ... ok
test db::tests::wal_and_integrity ... ok            (journal_mode=wal, integrity_check=ok, user_version=1)
test db::tests::coursework_insert ... ok
test db::tests::document_round_trip_and_hash_lineage_columns ... ok
test db::tests::annotation_crud_and_cascade ... ok  (FK cascade verified)
test result: ok. 5 passed; 0 failed
```

## Against gates

| Path | p50 | p95 | Vesper interim gate | Status |
|---|---|---|---|---|
| reading-state update | 339µs | 878µs | 150ms p50 | pass, ~440× headroom |
| annotation insert | 420µs | 1195µs | 150ms p50 | pass, ~350× headroom |

Note: bench uses the same `open()`/function chain the IPC commands call (open per op, as the
commands do). IPC serialization overhead not included until Phase 3's in-app run; the
`bench_ipc` command exists for that pass. Tracy still owns the 20ms-final vs 150ms-interim call.
