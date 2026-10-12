// SolsticeDocs — Tauri app builder. Storage lives in db.rs; IPC commands are
// thin wrappers over the same functions the tests exercise.
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            db::import_document,
            db::import_document_async,
            db::set_reading_state_cmd,
            db::add_annotation_cmd,
            db::list_annotations_cmd,
            db::delete_annotation_cmd,
            db::add_coursework_cmd,
            db::list_documents_cmd,
            db::write_export_cmd,
            db::clear_annotations_cmd,
            db::bench_ipc
        ])
        .setup(|app| {
            // Open + migrate the DB at boot so the schema exists before any IPC.
            let path = db::db_path(app.handle())?;
            db::open(&path)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
