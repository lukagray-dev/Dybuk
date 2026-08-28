//! Active Document File Watcher Module for Dybuk
//!
//! Watches the single active document currently opened in the canvas.
//! When external changes are detected on disk (e.g. edited in VS Code or external tools),
//! this watcher re-reads and re-decrypts the file (if .dybuk) and notifies the frontend
//! via Tauri events (`active-document-changed-on-disk`).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use dybuk::session::SessionStore;

/// Event payload emitted to the frontend when an active document changes externally on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalChangePayload {
    pub path: String,
    pub content: String,
    pub is_dybuk: bool,
}

/// Internal state holding the active watcher instance, target path, and anti-loop timestamps.
struct InnerWatcherState {
    current_path: Option<PathBuf>,
    _watcher: Option<RecommendedWatcher>,
    last_internal_save: Option<Instant>,
    last_emitted_hash: Option<u64>,
}

/// Thread-safe active document watcher handle managed by Tauri.
#[derive(Clone)]
pub struct ActiveDocumentWatcher {
    state: Arc<Mutex<InnerWatcherState>>,
}

impl Default for ActiveDocumentWatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl ActiveDocumentWatcher {
    /// Creates a new uninitialized active document watcher.
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(InnerWatcherState {
                current_path: None,
                _watcher: None,
                last_internal_save: None,
                last_emitted_hash: None,
            })),
        }
    }

    /// Records an internal save triggered from Dybuk itself to suppress false-positive reload loops.
    pub fn notify_internal_save(&self, _path: &Path) {
        if let Ok(mut lock) = self.state.lock() {
            lock.last_internal_save = Some(Instant::now());
        }
    }

    /// Stops watching any active document.
    pub fn unwatch(&self) {
        if let Ok(mut lock) = self.state.lock() {
            lock.current_path = None;
            lock._watcher = None;
            lock.last_emitted_hash = None;
        }
    }

    /// Starts watching a specific document on disk.
    pub fn watch(
        &self,
        app: AppHandle,
        path: PathBuf,
        session_store: Arc<Mutex<SessionStore>>,
    ) -> Result<(), String> {
        let canonical_path = path.canonicalize().unwrap_or_else(|_| path.clone());
        let watch_dir = canonical_path
            .parent()
            .ok_or_else(|| "Target file has no parent directory".to_string())?
            .to_path_buf();

        let state_clone = self.state.clone();
        let target_path = canonical_path.clone();

        // Create the debounced file event handler
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    match event.kind {
                        EventKind::Modify(_) | EventKind::Create(_) => {
                            // Check if the event involves our target file (either direct path or canonical)
                            let affects_target = event.paths.iter().any(|p| {
                                p == &target_path
                                    || p.canonicalize().map(|cp| cp == target_path).unwrap_or(false)
                                    || p.file_name() == target_path.file_name()
                            });

                            if !affects_target {
                                return;
                            }

                            // Check if this write was caused by Dybuk's own internal save within 750ms
                            let is_self_save = if let Ok(lock) = state_clone.lock() {
                                if let Some(last_save) = lock.last_internal_save {
                                    last_save.elapsed() < Duration::from_millis(750)
                                } else {
                                    false
                                }
                            } else {
                                false
                            };

                            if is_self_save {
                                return;
                            }

                            // Small delay to allow external write buffers and atomic renames to settle
                            std::thread::sleep(Duration::from_millis(60));

                            // Read the updated content
                            let is_dybuk = target_path
                                .extension()
                                .and_then(|ext| ext.to_str())
                                .map(|ext| ext.eq_ignore_ascii_case("dybuk"))
                                .unwrap_or(false);

                            let content_opt = if is_dybuk {
                                if let Ok(bytes) = std::fs::read(&target_path) {
                                    if let Ok(store) = session_store.lock() {
                                        if let Some(key) = store.get_key(&target_path) {
                                            dybuk::open_with_key(&bytes, key).ok().map(|s| s.to_string())
                                        } else {
                                            None
                                        }
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            } else {
                                std::fs::read_to_string(&target_path).ok()
                            };

                            if let Some(content) = content_opt {
                                let mut hasher = DefaultHasher::new();
                                content.hash(&mut hasher);
                                let current_hash = hasher.finish();

                                // Only emit if content actually changed from last emitted
                                if let Ok(mut lock) = state_clone.lock() {
                                    if lock.last_emitted_hash == Some(current_hash) {
                                        return;
                                    }
                                    lock.last_emitted_hash = Some(current_hash);
                                }

                                let payload = ExternalChangePayload {
                                    path: target_path.to_string_lossy().to_string(),
                                    content,
                                    is_dybuk,
                                };

                                let _ = app.emit("active-document-changed-on-disk", &payload);
                            }
                        }
                        _ => {}
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create file watcher: {}", e))?;

        // Watch the parent directory non-recursively so atomic renames/temp replaces are caught
        watcher
            .watch(&watch_dir, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch directory: {}", e))?;

        if let Ok(mut lock) = self.state.lock() {
            lock.current_path = Some(canonical_path);
            lock._watcher = Some(watcher);
            lock.last_emitted_hash = None;
        }

        Ok(())
    }
}

