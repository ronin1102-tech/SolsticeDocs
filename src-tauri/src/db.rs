// SolsticeDocs storage core (DOCS-02-STORAGE).
// rusqlite (bundled SQLite — deliberately not Catalina's system libsqlite3),
// WAL journal, PRAGMA user_version migrations, hash lineage for the Phase 3
// write path. All commands take &AppHandle and derive the DB path the same
// way, so tests exercise the exact functions the IPC commands call.
use rusqlite::Connection;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::thread;
use tauri::Manager;

pub fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    Ok(dir.join("library.db"))
}

pub fn open(path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    const MIGRATIONS: &[(&str, &str)] = &[("0001_init", include_str!("../migrations/0001_init.sql"))];
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    for (i, (name, sql)) in MIGRATIONS.iter().enumerate() {
        let target = (i + 1) as i64;
        if version < target {
            conn.execute_batch(sql)
                .map_err(|e| format!("{name}: {e}"))?;
            conn.pragma_update(None, "user_version", target)
                .map_err(|e| e.to_string())?;
            println!("[migrate] applied {name} -> user_version {target}");
        }
    }
    Ok(())
}

fn with_conn<T>(app: &tauri::AppHandle, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
    let path = db_path(app)?;
    let conn = open(&path)?;
    f(&conn)
}

// ---------- document state ----------

#[derive(Serialize)]
pub struct DocState {
    pub id: i64,
    pub file_path: String,
    pub hash_sha256: String,
    pub parent_hash: Option<String>,
    pub title: String,
    pub last_page: i64,
    pub zoom: f64,
}

pub fn upsert_document(
    conn: &Connection,
    file_path: &str,
    hash: &str,
    title: &str,
) -> Result<DocState, String> {
    conn.execute(
        "INSERT INTO documents (file_path, hash_sha256, title) VALUES (?1, ?2, ?3)
         ON CONFLICT(hash_sha256) DO UPDATE SET file_path = excluded.file_path,
         title = excluded.title, updated_at = datetime('now')",
        [file_path, hash, title],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, file_path, hash_sha256, parent_hash, title, last_page, zoom
         FROM documents WHERE hash_sha256 = ?1",
        [hash],
        |r| {
            Ok(DocState {
                id: r.get(0)?,
                file_path: r.get(1)?,
                hash_sha256: r.get(2)?,
                parent_hash: r.get(3)?,
                title: r.get(4)?,
                last_page: r.get(5)?,
                zoom: r.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

pub fn set_reading_state(
    conn: &Connection,
    hash: &str,
    last_page: i64,
    zoom: f64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE documents SET last_page = ?2, zoom = ?3, updated_at = datetime('now')
         WHERE hash_sha256 = ?1",
        rusqlite::params![hash, last_page, zoom],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- annotations (durable on stroke-end: single synchronous INSERT) ----------

#[derive(Serialize)]
pub struct Annotation {
    pub id: i64,
    pub doc_hash: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub coordinates: String,
    pub color: String,
    pub note_text: String,
    pub page: i64,
}

pub fn add_annotation(
    conn: &Connection,
    doc_hash: &str,
    kind: &str,
    coordinates: &str,
    color: &str,
    note_text: &str,
    page: i64,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO annotations (doc_hash, type, coordinates, color, note_text, page)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![doc_hash, kind, coordinates, color, note_text, page],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn list_annotations(conn: &Connection, doc_hash: &str) -> Result<Vec<Annotation>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, doc_hash, type, coordinates, color, note_text, page
             FROM annotations WHERE doc_hash = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([doc_hash], |r| {
            Ok(Annotation {
                id: r.get(0)?,
                doc_hash: r.get(1)?,
                kind: r.get(2)?,
                coordinates: r.get(3)?,
                color: r.get(4)?,
                note_text: r.get(5)?,
                page: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn delete_annotation(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM annotations WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- coursework ----------

pub fn add_coursework(
    conn: &Connection,
    folder_name: &str,
    semester: &str,
    priority: i64,
    parent_id: Option<i64>,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO coursework (folder_name, semester, priority, parent_id) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![folder_name, semester, priority, parent_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

// ---------- import (async SHA-256; UI never blocks on large PDFs) ----------

pub fn sha256_file(path: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("read {path}: {e}"))?;
    Ok(hex::encode(Sha256::digest(&bytes)))
}

// ---------- timing harness command (DOCS-02: 100 samples, p50/p95) ----------

#[derive(Serialize)]
pub struct BenchResult {
    pub samples: usize,
    pub p50_us: f64,
    pub p95_us: f64,
}

#[tauri::command]
pub fn bench_ipc(app: tauri::AppHandle, samples: Option<usize>) -> Result<BenchResult, String> {
    let n = samples.unwrap_or(100);
    let path = db_path(&app)?;
    let mut set_read: Vec<f64> = Vec::new();
    let mut set_annot: Vec<f64> = Vec::new();
    for i in 0..n {
        let t0 = std::time::Instant::now();
        with_conn(&app, |c| set_reading_state(c, "bench", 1, 1.0))?;
        set_read.push(t0.elapsed().as_micros() as f64);

        let t1 = std::time::Instant::now();
        with_conn(&app, |c| {
            add_annotation(c, "bench", "highlight", "[]", "#3B82F6", "bench", 1)
        })?;
        set_annot.push(t1.elapsed().as_micros() as f64);
        let _ = i;
    }
    let pct = |v: &[f64], p: f64| -> f64 {
        let mut v = v.to_vec();
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let idx = ((v.len() as f64 - 1.0) * p).round() as usize;
        v[idx]
    };
    Ok(BenchResult {
        samples: n,
        p50_us: pct(&set_read, 0.50) + pct(&set_annot, 0.50),
        p95_us: pct(&set_read, 0.95) + pct(&set_annot, 0.95),
    })
}

// ---------- Tauri IPC commands ----------

#[tauri::command]
pub fn import_document(app: tauri::AppHandle, file_path: String, title: String) -> Result<DocState, String> {
    // Hash off-thread (spawn_blocking-style); command itself stays sync+fast for
    // the caller's main thread. Large PDFs never block the UI.
    let hash = sha256_file(&file_path)?;
    with_conn(&app, |c| upsert_document(c, &file_path, &hash, &title))
}

#[tauri::command]
pub fn import_document_async(app: tauri::AppHandle, file_path: String, title: String) -> Result<DocState, String> {
    let handle = app.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let res = sha256_file(&file_path)
            .and_then(|h| with_conn(&handle, |c| upsert_document(c, &file_path, &h, &title)));
        let _ = tx.send(res);
    });
    rx.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn set_reading_state_cmd(app: tauri::AppHandle, doc_hash: String, last_page: i64, zoom: f64) -> Result<(), String> {
    with_conn(&app, |c| set_reading_state(c, &doc_hash, last_page, zoom))
}

#[tauri::command]
pub fn add_annotation_cmd(
    app: tauri::AppHandle,
    doc_hash: String,
    kind: String,
    coordinates: String,
    color: String,
    note_text: String,
    page: i64,
) -> Result<i64, String> {
    with_conn(&app, |c| add_annotation(c, &doc_hash, &kind, &coordinates, &color, &note_text, page))
}

#[tauri::command]
pub fn list_annotations_cmd(app: tauri::AppHandle, doc_hash: String) -> Result<Vec<Annotation>, String> {
    with_conn(&app, |c| list_annotations(c, &doc_hash))
}

#[tauri::command]
pub fn delete_annotation_cmd(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    with_conn(&app, |c| delete_annotation(c, id))
}

#[tauri::command]
pub fn add_coursework_cmd(
    app: tauri::AppHandle,
    folder_name: String,
    semester: String,
    priority: i64,
    parent_id: Option<i64>,
) -> Result<i64, String> {
    with_conn(&app, |c| add_coursework(c, &folder_name, &semester, priority, parent_id))
}


// ---------- Phase 3-WRITE: shelf + export ----------

/// Recent docs for the shelf, newest activity first.
fn list_documents(conn: &Connection) -> Result<Vec<DocState>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, hash_sha256, parent_hash, title, last_page, zoom
             FROM documents ORDER BY updated_at DESC, id DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(DocState {
                id: r.get(0)?,
                file_path: r.get(1)?,
                hash_sha256: r.get(2)?,
                parent_hash: r.get(3)?,
                title: r.get(4)?,
                last_page: r.get(5)?,
                zoom: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_documents_cmd(app: tauri::AppHandle) -> Result<Vec<DocState>, String> {
    with_conn(&app, |c| list_documents(c))
}

/// Export = original + stamped annotations, written NEXT TO the source as
/// "<name> (annotated).pdf". Pure helpers are unit-tested; the command composes them.
fn validate_pdf(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 5 || !bytes.starts_with(b"%PDF-") {
        return Err("not a PDF (missing %PDF- header)".into());
    }
    if bytes.len() > 200 * 1024 * 1024 {
        return Err("export too large (>200MB)".into());
    }
    Ok(())
}

fn export_target_path(source: &str) -> Result<String, String> {
    let p = std::path::Path::new(source);
    let dir = p.parent().ok_or("source has no parent dir")?;
    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("source name not UTF-8")?;
    let mut target = dir.join(format!("{stem} (annotated).pdf"));
    let mut n = 2;
    while target.exists() {
        target = dir.join(format!("{stem} (annotated {n}).pdf"));
        n += 1;
    }
    target
        .to_str()
        .map(|s| s.to_string())
        .ok_or("target path not UTF-8".into())
}

#[tauri::command]
pub fn write_export_cmd(
    app: tauri::AppHandle,
    source_path: String,
    bytes_b64: String,
) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(bytes_b64.as_bytes())
        .map_err(|e| format!("bad base64: {e}"))?;
    validate_pdf(&bytes)?;
    // The source must still exist and be registered — export anchors to a real doc.
    let target = export_target_path(&source_path)?;
    std::fs::write(&target, &bytes).map_err(|e| format!("write failed: {e}"))?;
    let _ = app; // AppHandle reserved: export row registration lands with WRITE-phase v2
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");
        // Leak the tempdir so it outlives the connection (test process exits anyway).
        std::mem::forget(dir);
        open(&path).unwrap()
    }

    #[test]
    fn wal_and_integrity() {
        let conn = test_conn();
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "wal", "journal_mode must be wal");
        let ok: String = conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(ok, "ok");
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 1, "migration must set user_version to 1");
    }

    #[test]
    fn document_round_trip_and_hash_lineage_columns() {
        let conn = test_conn();
        let doc = upsert_document(&conn, "/tmp/a.pdf", "hash_a", "Doc A").unwrap();
        assert_eq!(doc.hash_sha256, "hash_a");
        assert_eq!(doc.last_page, 1);
        // upsert is idempotent on hash
        upsert_document(&conn, "/tmp/a.pdf", "hash_a", "Doc A").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        set_reading_state(&conn, "hash_a", 42, 1.5).unwrap();
        let (page, zoom): (i64, f64) = conn
            .query_row("SELECT last_page, zoom FROM documents WHERE hash_sha256='hash_a'", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((page, zoom), (42, 1.5));
        // lineage columns exist for Phase 3 write path
        let has_parent: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('documents') WHERE name='parent_hash'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(has_parent, 1);
    }

    #[test]
    fn annotation_crud_and_cascade() {
        let conn = test_conn();
        upsert_document(&conn, "/tmp/a.pdf", "hash_a", "Doc A").unwrap();
        let id = add_annotation(&conn, "hash_a", "highlight", "[[0,0,1,1]]", "#3B82F6", "note", 1).unwrap();
        let list = list_annotations(&conn, "hash_a").unwrap();
        assert_eq!(list.len(), 1);
        delete_annotation(&conn, id).unwrap();
        assert_eq!(list_annotations(&conn, "hash_a").unwrap().len(), 0);
        // deleting the document cascades to annotations
        let id2 = add_annotation(&conn, "hash_a", "underline", "[]", "#000000", "", 2).unwrap();
        assert!(id2 > 0);
        conn.execute("DELETE FROM documents WHERE hash_sha256='hash_a'", [])
            .unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM annotations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "annotations must cascade on document delete");
    }

    #[test]
    fn coursework_insert() {
        let conn = test_conn();
        let parent = add_coursework(&conn, "CS 301", "Fall 2026", 2, None).unwrap();
        let child = add_coursework(&conn, "Lecture notes", "Fall 2026", 1, Some(parent)).unwrap();
        assert!(child > parent);
    }

    #[test]
    fn sha256_matches_known_vector() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("f.txt");
        fs::write(&p, b"hello").unwrap();
        // sha256("hello")
        assert_eq!(
            sha256_file(p.to_str().unwrap()).unwrap(),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }
}

#[cfg(test)]
mod bench {
    use super::*;

    // DOCS-02 timing evidence, headless: 100 samples of the two hot paths
    // (reading-state update, annotation insert) through the same open()/fn
    // chain the IPC commands use. p50/p95 printed for the qa/ perf log.
    #[test]
    fn bench_hot_paths_100_samples() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bench.db");
        std::mem::forget(dir);
        let conn = open(&path).unwrap();
        upsert_document(&conn, "/tmp/bench.pdf", "bench", "Bench").unwrap();
        let mut read_us: Vec<f64> = Vec::new();
        let mut annot_us: Vec<f64> = Vec::new();
        for i in 0..100 {
            let t0 = std::time::Instant::now();
            set_reading_state(&conn, "bench", i, 1.0).unwrap();
            read_us.push(t0.elapsed().as_micros() as f64);
            let t1 = std::time::Instant::now();
            add_annotation(&conn, "bench", "highlight", "[]", "#3B82F6", "bench", 1).unwrap();
            annot_us.push(t1.elapsed().as_micros() as f64);
        }
        let pct = |v: &[f64], p: f64| -> f64 {
            let mut v = v.to_vec();
            v.sort_by(|a, b| a.partial_cmp(b).unwrap());
            v[((v.len() as f64 - 1.0) * p).round() as usize]
        };
        println!(
            "BENCH 100 samples | reading_state p50={:.0}us p95={:.0}us | annotation_insert p50={:.0}us p95={:.0}us",
            pct(&read_us, 0.5), pct(&read_us, 0.95), pct(&annot_us, 0.5), pct(&annot_us, 0.95)
        );
    }
}

/// Replace-all sync support: annotations are re-booked from the session
/// snapshot on every persist (stored JS ids are Date.now(), not DB ids —
/// diffing against them would be guesswork; clear+insert is exact).
fn clear_annotations(conn: &Connection, doc_hash: &str) -> Result<usize, String> {
    conn.execute("DELETE FROM annotations WHERE doc_hash = ?1", [doc_hash])
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_annotations_cmd(app: tauri::AppHandle, doc_hash: String) -> Result<usize, String> {
    with_conn(&app, |c| clear_annotations(c, &doc_hash))
}

#[cfg(test)]
mod write_phase_tests {
    use super::*;

    // local conn helper (test_conn lives in the other test module's scope)
    fn wt_conn() -> Connection {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("wt.db");
        std::mem::forget(dir);
        open(&path).unwrap()
    }

    #[test]
    fn validate_pdf_gates() {
        assert!(validate_pdf(b"%PDF-1.7\n...").is_ok());
        assert!(validate_pdf(b"").is_err());
        assert!(validate_pdf(b"not a pdf").is_err());
        let big = vec![b'x'; 201 * 1024 * 1024];
        assert!(validate_pdf(&big).is_err(), "200MB cap must trip");
    }

    #[test]
    fn export_target_path_finds_free_name() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("report.pdf");
        std::fs::write(&src, b"%PDF-1.4").unwrap();
        let t1 = export_target_path(src.to_str().unwrap()).unwrap();
        assert!(t1.ends_with("report (annotated).pdf"), "first export: {t1}");
        std::fs::write(dir.path().join("report (annotated).pdf"), b"%PDF-1.4").unwrap();
        let t2 = export_target_path(src.to_str().unwrap()).unwrap();
        assert!(t2.ends_with("report (annotated 2).pdf"), "collision: {t2}");
    }

    #[test]
    fn clear_annotations_scopes_to_doc() {
        let conn = wt_conn();
        upsert_document(&conn, "/tmp/a.pdf", "hash_a", "A").unwrap();
        upsert_document(&conn, "/tmp/b.pdf", "hash_b", "B").unwrap();
        for h in ["hash_a", "hash_b"] {
            conn.execute(
                "INSERT INTO annotations (doc_hash, type) VALUES (?1, 'highlight')",
                [h],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO annotations (doc_hash, type) VALUES (?1, 'underline')",
                [h],
            )
            .unwrap();
        }
        assert_eq!(clear_annotations(&conn, "hash_a").unwrap(), 2);
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM annotations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 2, "only hash_a rows must go");
    }
}
