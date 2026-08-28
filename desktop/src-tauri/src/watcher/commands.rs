//! Active Document Watcher IPC Commands

use std::path::PathBuf;
use tauri::{AppHandle, State};

use crate::sidebar::commands::AppState;
use super::file_watcher::ActiveDocumentWatcher;

/// Starts watching the specified active document for external filesystem modifications.
#[tauri::command]
pub async fn watch_active_document(
    app: AppHandle,
    state: State<'_, AppState>,
    watcher: State<'_, ActiveDocumentWatcher>,
    path: String,
) -> Result<(), String> {
    let file_path = PathBuf::from(path.trim());
    if !file_path.exists() {
        return Err("Cannot watch non-existent file".to_string());
    }

    watcher.watch(app, file_path, state.session_store.clone())
}

/// Stops watching the currently active document.
#[tauri::command]
pub async fn unwatch_active_document(
    watcher: State<'_, ActiveDocumentWatcher>,
) -> Result<(), String> {
    watcher.unwatch();
    Ok(())
}

