use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use dybuk::{create_document, recents, NewDocument, SessionStore};

/// State holding the shared session key store.
pub struct AppState {
    pub session_store: Arc<Mutex<SessionStore>>,
}

/// Serializable entry for documents displayed in the sidebar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentDocEntry {
    pub path: String,
    pub name: String,
    pub last_opened: String,
    pub is_dybuk: bool,
}

/// Returned payload when loading a document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentPayload {
    pub content: String,
    pub is_dybuk: bool,
    pub is_unlocked: bool,
}

/// Helper function to resolve the application's persistent recents store JSON path.
fn get_recents_store_path(app: &AppHandle) -> PathBuf {
    let base_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    base_dir.join("recents.json")
}

/// Helper function to check if a file extension corresponds to a .dybuk vault.
fn is_dybuk_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("dybuk"))
        .unwrap_or(false)
}

/// Lists all recent documents from history, auto-pruning non-existent files.
#[tauri::command]
pub async fn list_documents(app: AppHandle) -> Result<Vec<RecentDocEntry>, String> {
    let store_path = get_recents_store_path(&app);
    let entries = recents::validate_and_prune(&store_path)
        .map_err(|e| format!("Failed to load recent documents: {}", e))?;

    let docs = entries
        .into_iter()
        .map(|entry| {
            let is_dybuk = is_dybuk_path(&entry.path);
            RecentDocEntry {
                path: entry.path.to_string_lossy().to_string(),
                name: entry.name,
                last_opened: entry.last_opened.to_rfc3339(),
                is_dybuk,
            }
        })
        .collect();

    Ok(docs)
}

/// Creates a new document (.md or .dybuk) and adds it to the recent history.
#[tauri::command]
pub async fn create_document_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    is_dybuk: bool,
    password: Option<String>,
) -> Result<RecentDocEntry, String> {
    let file_path = PathBuf::from(&path);

    // Validate path
    if path.trim().is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    let kind = if is_dybuk {
        let pass = password.ok_or_else(|| "Password is required for encrypted vaults".to_string())?;
        if pass.is_empty() {
            return Err("Password cannot be empty for encrypted vaults".to_string());
        }
        NewDocument::Dybuk { password: pass }
    } else {
        NewDocument::Markdown
    };

    // Create the document through Dybuk Core
    let created = create_document(&file_path, kind)
        .map_err(|e| format!("Failed to create document: {}", e))?;

    // If a session key was derived, insert into SessionStore
    if let Some(key) = created.session_key {
        if let Ok(mut store) = state.session_store.lock() {
            store.unlock(created.path.clone(), key);
        }
    }

    // Add newly created file to recents store
    let store_path = get_recents_store_path(&app);
    recents::add_recent(&store_path, &created.path)
        .map_err(|e| format!("Failed to record document in history: {}", e))?;

    let file_name = created
        .path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    Ok(RecentDocEntry {
        path: created.path.to_string_lossy().to_string(),
        name: file_name,
        last_opened: chrono::Utc::now().to_rfc3339(),
        is_dybuk,
    })
}

/// Loads a document from disk. If .dybuk, validates password and decrypts.
#[tauri::command]
pub async fn read_document(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    password: Option<String>,
) -> Result<DocumentPayload, String> {
    let file_path = PathBuf::from(&path);
    let is_dybuk = is_dybuk_path(&file_path);

    if is_dybuk {
        let file_bytes = std::fs::read(&file_path)
            .map_err(|e| format!("Failed to read vault file: {}", e))?;

        if let Some(pass) = password {
            let decrypted_str = dybuk::open(&file_bytes, &pass)
                .map_err(|e| format!("Decryption failed: {}", e))?;

            // Extract salt and derive key for session store caching
            if let Ok(salt) = dybuk::format::vault::extract_salt(&file_bytes) {
                if let Ok(key) = dybuk::format::vault::derive_key_for_session(&pass, &salt) {
                    if let Ok(mut store) = state.session_store.lock() {
                        store.unlock(file_path.clone(), key);
                    }
                }
            }

            // Update recents
            let store_path = get_recents_store_path(&app);
            let _ = recents::add_recent(&store_path, &file_path);

            Ok(DocumentPayload {
                content: decrypted_str.to_string(),
                is_dybuk: true,
                is_unlocked: true,
            })
        } else {
            // Check if already unlocked in session store
            let cached_key = if let Ok(store) = state.session_store.lock() {
                store.get_key(&file_path).copied()
            } else {
                None
            };

            if let Some(key) = cached_key {
                let decrypted_str = dybuk::format::vault::open_with_key(&file_bytes, &key)
                    .map_err(|e| format!("Decryption with cached session key failed: {}", e))?;

                // Update recents
                let store_path = get_recents_store_path(&app);
                let _ = recents::add_recent(&store_path, &file_path);

                Ok(DocumentPayload {
                    content: decrypted_str.to_string(),
                    is_dybuk: true,
                    is_unlocked: true,
                })
            } else {
                Err("VAULT_LOCKED".to_string())
            }
        }
    } else {
        // Plain Markdown file
        let content = dybuk::load_file(&file_path)
            .map_err(|e| format!("Failed to read markdown file: {}", e))?;

        // Update recents
        let store_path = get_recents_store_path(&app);
        let _ = recents::add_recent(&store_path, &file_path);

        Ok(DocumentPayload {
            content,
            is_dybuk: false,
            is_unlocked: true,
        })
    }
}

/// Saves document content back to disk. If .dybuk, seals with password.
#[tauri::command]
pub async fn save_document(
    app: AppHandle,
    state: State<'_, AppState>,
    watcher: State<'_, crate::watcher::ActiveDocumentWatcher>,
    path: String,
    content: String,
    password: Option<String>,
) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    let is_dybuk = is_dybuk_path(&file_path);

    // Notify watcher to suppress self-triggered external change events
    watcher.notify_internal_save(&file_path);

    if is_dybuk {
        let pass = password.ok_or_else(|| "Password is required to save encrypted vault".to_string())?;
        let sealed_bytes = dybuk::seal(&content, &pass)
            .map_err(|e| format!("Failed to encrypt vault: {}", e))?;

        if let Some(parent) = file_path.parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                let _ = std::fs::create_dir_all(parent);
            }
        }

        std::fs::write(&file_path, &sealed_bytes)
            .map_err(|e| format!("Failed to write vault file: {}", e))?;

        // Cache session key
        if let Ok(salt) = dybuk::format::vault::extract_salt(&sealed_bytes) {
            if let Ok(key) = dybuk::format::vault::derive_key_for_session(&pass, &salt) {
                if let Ok(mut store) = state.session_store.lock() {
                    store.unlock(file_path.clone(), key);
                }
            }
        }
    } else {
        dybuk::save_file(&file_path, &content)
            .map_err(|e| format!("Failed to save markdown document: {}", e))?;
    }

    let store_path = get_recents_store_path(&app);
    let _ = recents::add_recent(&store_path, &file_path);

    Ok(())
}

/// Locks a vault file by removing its key from the in-memory session store.
#[tauri::command]
pub async fn lock_vault(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if let Ok(mut store) = state.session_store.lock() {
        store.lock(&file_path);
    }
    Ok(())
}

/// Checks if a vault file is unlocked in the session store.
#[tauri::command]
pub async fn check_vault_unlocked(state: State<'_, AppState>, path: String) -> Result<bool, String> {
    let file_path = PathBuf::from(&path);
    if let Ok(store) = state.session_store.lock() {
        Ok(store.is_unlocked(&file_path))
    } else {
        Ok(false)
    }
}

/// Retrieves the default user documents directory path.
#[tauri::command]
pub async fn get_default_documents_dir(app: AppHandle) -> Result<String, String> {
    let doc_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| PathBuf::from("."));

    Ok(doc_dir.to_string_lossy().to_string())
}

/// Removes a document from the recents store.
#[tauri::command]
pub async fn remove_recent_cmd(app: AppHandle, path: String) -> Result<(), String> {
    let store_path = get_recents_store_path(&app);
    if !store_path.exists() {
        return Ok(());
    }

    let mut entries = recents::list_recents(&store_path)
        .map_err(|e| format!("Failed to list recents: {}", e))?;

    let target_path = PathBuf::from(&path);
    entries.retain(|e| e.path != target_path);

    let serialized = serde_json::to_string_pretty(&entries)
        .map_err(|e| format!("Failed to serialize recents: {}", e))?;

    std::fs::write(&store_path, serialized)
        .map_err(|e| format!("Failed to update recents file: {}", e))?;

    Ok(())
}
