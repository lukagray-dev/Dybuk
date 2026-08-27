//! # Recents Module
//!
//! This module manages the list of recently opened and saved markdown files for Dybuk.
//! It persists the list as human-readable, pretty-printed JSON in a file path provided by
//! the application layer (for example, the OS application data directory).
//!
//! ## Key Responsibilities
//! - **Track Recent Files:** Record file path, derived document name, and last opened timestamp.
//! - **Deduplication:** Ensure each unique file path only appears once, placing the most recently accessed item at the front.
//! - **Pruning Stale Entries:** Automatically validate and remove files from the history that were deleted or moved outside the app.
//! - **Platform Agnostic:** Takes `store_path: &Path` directly from caller, keeping this module pure and easy to test.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Error types that can happen when reading, writing, or validating the recents store.
#[derive(Debug, Error)]
pub enum RecentsError {
    /// An I/O error occurred when accessing or writing the recents store file.
    #[error("I/O error occurred while accessing recents store '{path}': {source}")]
    Io {
        /// Path to the recents store JSON file.
        path: PathBuf,
        /// The underlying standard I/O error.
        #[source]
        source: std::io::Error,
    },

    /// The recents file contained invalid JSON or could not be serialized to JSON.
    #[error("JSON error occurred while processing recents store '{path}': {source}")]
    Json {
        /// Path to the recents store JSON file.
        path: PathBuf,
        /// The underlying serde_json error.
        #[source]
        source: serde_json::Error,
    },

    /// Failed to create the directory hierarchy for the recents store file.
    #[error("Failed to create parent directory '{parent}' for recents store '{path}': {source}")]
    CreateParentDir {
        /// The target store path.
        path: PathBuf,
        /// The parent directory path that could not be created.
        parent: PathBuf,
        /// The underlying standard I/O error.
        #[source]
        source: std::io::Error,
    },
}

/// Represents a single recently opened or saved document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecentEntry {
    /// The full filesystem path to the markdown file.
    pub path: PathBuf,

    /// Human-friendly display name (derived from the file stem at insert time, e.g. "todo" from "todo.md").
    pub name: String,

    /// Timestamp of when the file was last opened or saved in UTC.
    pub last_opened: DateTime<Utc>,
}

/// Loads and returns the list of recent files as-is from the store JSON file.
///
/// # Behavior
/// - If the store file does not exist yet (e.g. first run of the app), this returns an empty `Vec`
///   rather than an error, making startup smooth and error-free.
/// - If the file exists but contains empty content, returns an empty `Vec`.
/// - Does **not** check if the referenced target files exist on disk (use [`validate_and_prune`] for that).
///
/// # Arguments
/// * `store_path` - Path to the JSON file where recents are stored (e.g. `~/.config/dybuk/recents.json`).
///
/// # Errors
/// * Returns [`RecentsError::Io`] if reading an existing file fails due to permission or hardware errors.
/// * Returns [`RecentsError::Json`] if the store file contains malformed or corrupt JSON.
///
/// # Examples
/// ```no_run
/// use std::path::Path;
/// use dybuk::recents::list_recents;
///
/// let store_path = Path::new("recents.json");
/// let recents = list_recents(store_path).expect("Failed to list recents");
/// for entry in recents {
///     println!("{}: {:?}", entry.name, entry.path);
/// }
/// ```
pub fn list_recents(store_path: &Path) -> Result<Vec<RecentEntry>, RecentsError> {
    // Step 1: If the file does not exist on disk, return an empty list immediately.
    // This happens naturally when the app is installed for the first time.
    if !store_path.exists() {
        return Ok(Vec::new());
    }

    // Step 2: Read the entire file content into a String.
    // If the file was deleted right between exists() check and read_to_string(),
    // we handle NotFound gracefully by returning an empty Vec.
    let content = match std::fs::read_to_string(store_path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => {
            return Err(RecentsError::Io {
                path: store_path.to_path_buf(),
                source,
            })
        }
    };

    // Step 3: Handle empty or whitespace-only store files safely.
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Step 4: Deserialize the JSON string into a Vec of RecentEntry structs.
    let entries: Vec<RecentEntry> =
        serde_json::from_str(&content).map_err(|source| RecentsError::Json {
            path: store_path.to_path_buf(),
            source,
        })?;

    Ok(entries)
}

/// Adds a file to the recents list or updates its position and timestamp if already present.
///
/// # Behavior
/// 1. Reads the existing list from `store_path` (starting with an empty list if file doesn't exist).
/// 2. Derives the display name from the file stem (e.g. `/docs/meeting-notes.md` becomes `"meeting-notes"`).
/// 3. Removes any existing entry with the same path (deduplication).
/// 4. Inserts the new entry at the very beginning (index 0) with the current UTC timestamp.
/// 5. Writes the updated list back to disk formatted as pretty JSON.
///
/// # Arguments
/// * `store_path` - Path to the JSON file where recents are saved.
/// * `file_path` - Path of the markdown document that was just opened or saved.
///
/// # Errors
/// * Returns [`RecentsError::CreateParentDir`] if creating the store's directory fails.
/// * Returns [`RecentsError::Json`] if JSON serialization fails.
/// * Returns [`RecentsError::Io`] if writing to disk fails.
///
/// # Examples
/// ```no_run
/// use std::path::Path;
/// use dybuk::recents::add_recent;
///
/// let store_path = Path::new("recents.json");
/// let note_path = Path::new("notes/ideas.md");
/// add_recent(store_path, note_path).expect("Failed to record recent note");
/// ```
pub fn add_recent(store_path: &Path, file_path: &Path) -> Result<(), RecentsError> {
    // Step 1: Retrieve the existing recents list (or empty list if no file yet).
    let mut entries = list_recents(store_path)?;

    // Step 2: Extract a friendly name from the file stem.
    // E.g., for "/path/to/my_notes.md", file_stem() is "my_notes".
    // If the path doesn't have a valid stem or is empty, we fall back to "Untitled".
    let name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("Untitled")
        .to_string();

    // Step 3: Remove any previous entry pointing to this exact same path.
    // This ensures no duplicate entries exist in the history.
    entries.retain(|entry| entry.path != file_path);

    // Step 4: Construct the new entry with current UTC time and place it at index 0 (most recent).
    let new_entry = RecentEntry {
        path: file_path.to_path_buf(),
        name,
        last_opened: Utc::now(),
    };
    entries.insert(0, new_entry);

    // Step 5: Save the updated entries list back to disk.
    write_recents_store(store_path, &entries)?;

    Ok(())
}

/// Validates all entries in the recents list against the filesystem and removes stale items.
///
/// # Behavior
/// 1. Reads the list from `store_path`.
/// 2. Checks each `entry.path.exists()` on the filesystem.
/// 3. If any files no longer exist (e.g. deleted or moved by the user in file explorer),
///    they are filtered out.
/// 4. If any entries were removed, rewrites the store file with the pruned list.
/// 5. Returns the cleaned list of valid entries.
///
/// This is typically called once on application startup before populating the UI sidebar.
///
/// # Arguments
/// * `store_path` - Path to the recents store JSON file.
///
/// # Errors
/// * Returns [`RecentsError::Io`] or [`RecentsError::Json`] if reading or rewriting fails.
///
/// # Examples
/// ```no_run
/// use std::path::Path;
/// use dybuk::recents::validate_and_prune;
///
/// let store_path = Path::new("recents.json");
/// let valid_entries = validate_and_prune(store_path).expect("Failed to clean recents");
/// println!("Valid recent files: {}", valid_entries.len());
/// ```
pub fn validate_and_prune(store_path: &Path) -> Result<Vec<RecentEntry>, RecentsError> {
    // Step 1: Load the existing recents list.
    let entries = list_recents(store_path)?;
    let initial_count = entries.len();

    // Step 2: Filter out entries where the file no longer exists on disk.
    let pruned: Vec<RecentEntry> = entries
        .into_iter()
        .filter(|entry| entry.path.exists())
        .collect();

    // Step 3: If the count changed (meaning at least one stale file was removed),
    // write the cleaned list back to disk so we don't keep tracking deleted files.
    if pruned.len() != initial_count {
        write_recents_store(store_path, &pruned)?;
    }

    Ok(pruned)
}

/// Helper function to serialize and write the recents list as pretty-printed JSON.
///
/// Creates any missing parent directories for `store_path` before writing.
fn write_recents_store(store_path: &Path, entries: &[RecentEntry]) -> Result<(), RecentsError> {
    // Step 1: Ensure the parent folder exists (e.g. app data folder).
    if let Some(parent) = store_path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|source| RecentsError::CreateParentDir {
                path: store_path.to_path_buf(),
                parent: parent.to_path_buf(),
                source,
            })?;
        }
    }

    // Step 2: Format the entries list as pretty-printed JSON.
    // Pretty printing makes the file human-readable and easy to debug if inspected manually.
    let json_data = serde_json::to_string_pretty(entries).map_err(|source| RecentsError::Json {
        path: store_path.to_path_buf(),
        source,
    })?;

    // Step 3: Write the JSON string to the target store path.
    std::fs::write(store_path, json_data).map_err(|source| RecentsError::Io {
        path: store_path.to_path_buf(),
        source,
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_list_recents_missing_file_returns_empty_vec() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let non_existent_store = temp_dir.path().join("recents_missing.json");

        // When the recents file doesn't exist yet, list_recents should return Ok(empty Vec)
        let result = list_recents(&non_existent_store);
        assert!(result.is_ok(), "Missing store file must return Ok");
        assert_eq!(result.unwrap(), Vec::<RecentEntry>::new());
    }

    #[test]
    fn test_add_recent_creates_store_and_adds_entry() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let store_path = temp_dir.path().join("recents.json");
        let sample_file = temp_dir.path().join("project_notes.md");

        // Add a recent file entry.
        let add_res = add_recent(&store_path, &sample_file);
        assert!(add_res.is_ok(), "add_recent should succeed");

        // Verify the store file was created on disk.
        assert!(store_path.exists(), "Store JSON file must exist on disk");

        // Load the list and verify entry contents.
        let list = list_recents(&store_path).expect("list_recents should succeed");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, sample_file);
        assert_eq!(list[0].name, "project_notes");
    }

    #[test]
    fn test_add_recent_dedupes_and_orders_most_recent_first() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let store_path = temp_dir.path().join("recents.json");

        let file_a = temp_dir.path().join("first_note.md");
        let file_b = temp_dir.path().join("second_note.md");

        // 1. Add file A
        add_recent(&store_path, &file_a).expect("Adding file A should succeed");

        // 2. Add file B
        add_recent(&store_path, &file_b).expect("Adding file B should succeed");

        let list_after_b = list_recents(&store_path).unwrap();
        assert_eq!(list_after_b.len(), 2);
        assert_eq!(list_after_b[0].path, file_b, "File B should be at the front");
        assert_eq!(list_after_b[1].path, file_a, "File A should be second");

        // 3. Add file A again (re-opening file A)
        add_recent(&store_path, &file_a).expect("Re-adding file A should succeed");

        let list_after_reopen_a = list_recents(&store_path).unwrap();
        // Check that list was deduplicated (still 2 items, not 3)
        assert_eq!(list_after_reopen_a.len(), 2, "Deduplication must keep length at 2");
        // Check that file A moved to index 0 (most recent)
        assert_eq!(list_after_reopen_a[0].path, file_a, "File A must now be at index 0");
        assert_eq!(list_after_reopen_a[1].path, file_b, "File B must now be at index 1");
    }

    #[test]
    fn test_validate_and_prune_removes_deleted_files() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let store_path = temp_dir.path().join("recents.json");

        let file_keep = temp_dir.path().join("keep_me.md");
        let file_delete = temp_dir.path().join("delete_me.md");

        // Create the actual files on disk
        std::fs::write(&file_keep, "I stay").expect("Failed to create keep file");
        std::fs::write(&file_delete, "I will be deleted").expect("Failed to create delete file");

        // Add both files to recents
        add_recent(&store_path, &file_keep).unwrap();
        add_recent(&store_path, &file_delete).unwrap();

        // Verify both are present in recents
        let initial_list = list_recents(&store_path).unwrap();
        assert_eq!(initial_list.len(), 2);

        // Delete the second file from the filesystem
        std::fs::remove_file(&file_delete).expect("Failed to delete file from disk");

        // Run validate_and_prune
        let pruned_list = validate_and_prune(&store_path).expect("Pruning should succeed");

        // Only file_keep should remain
        assert_eq!(pruned_list.len(), 1);
        assert_eq!(pruned_list[0].path, file_keep);
        assert_eq!(pruned_list[0].name, "keep_me");

        // Verify the store on disk was also updated
        let reloaded_list = list_recents(&store_path).unwrap();
        assert_eq!(reloaded_list.len(), 1);
        assert_eq!(reloaded_list[0].path, file_keep);
    }

    #[test]
    fn test_validate_and_prune_on_missing_store_returns_empty_vec() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let store_path = temp_dir.path().join("missing_store.json");

        let result = validate_and_prune(&store_path);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Vec::<RecentEntry>::new());
    }

    #[test]
    fn test_corrupted_json_returns_json_error() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let store_path = temp_dir.path().join("corrupted.json");

        // Write invalid JSON content
        std::fs::write(&store_path, "{ this is not valid JSON }").expect("Failed to write test file");

        let result = list_recents(&store_path);
        assert!(result.is_err(), "Corrupted JSON must return error");

        match result.unwrap_err() {
            RecentsError::Json { path, .. } => {
                assert_eq!(path, store_path);
            }
            other => panic!("Expected RecentsError::Json, got {:?}", other),
        }
    }
}

