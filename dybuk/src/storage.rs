//! # Storage Module
//!
//! This module handles plain markdown file input and output (I/O) for Dybuk.
//! It provides straightforward, robust functions to read from and write to the
//! local filesystem without any UI or platform-specific dialog dependencies.
//!
//! All file operations are UTF-8 validated and parent directory creation is
//! handled automatically so you don't have to worry about missing folders.

use std::path::{Path, PathBuf};
use thiserror::Error;

/// Storage-related errors that can occur during markdown file operations.
///
/// Each variant includes contextual information such as the offending path
/// and the underlying source error, making debugging and user error messages clear.
#[derive(Debug, Error)]
pub enum StorageError {
    /// An input/output error occurred with the filesystem (e.g. permission denied, disk full, file not found).
    #[error("I/O error occurred while accessing path '{path}': {source}")]
    Io {
        /// The file or directory path where the I/O error occurred.
        path: PathBuf,
        /// The underlying standard I/O error.
        #[source]
        source: std::io::Error,
    },

    /// The file was read successfully from disk, but its content is not valid UTF-8 text.
    #[error("Failed to decode file content as valid UTF-8 at '{path}': {source}")]
    InvalidUtf8 {
        /// The path to the file that contained invalid UTF-8 bytes.
        path: PathBuf,
        /// The UTF-8 decoding error details.
        #[source]
        source: std::string::FromUtf8Error,
    },

    /// The target path does not have a valid parent directory (e.g. an empty path or root path).
    #[error("Invalid path '{path}': parent directory could not be determined")]
    NoParentDirectory {
        /// The invalid path provided by the caller.
        path: PathBuf,
    },

    /// Creating the parent directory structure for the target file failed.
    #[error("Failed to create parent directory '{parent}' for path '{path}': {source}")]
    CreateParentDir {
        /// The target file path we were trying to save to.
        path: PathBuf,
        /// The specific parent directory we attempted to create.
        parent: PathBuf,
        /// The underlying standard I/O error that caused directory creation to fail.
        #[source]
        source: std::io::Error,
    },
}

/// Saves UTF-8 markdown content to the specified file path.
///
/// # Behavior
/// 1. Inspects the target file path to find its parent directory.
/// 2. If the parent directory does not exist on the filesystem yet, creates all
///    intermediate parent directories automatically (similar to `mkdir -p`).
/// 3. Writes the content string to the file. If the file already exists, it is overwritten.
///
/// # Arguments
/// * `path` - The destination filesystem path where the markdown file should be saved.
/// * `content` - The UTF-8 markdown text content to write.
///
/// # Errors
/// * Returns [`StorageError::NoParentDirectory`] if the path has no parent (e.g. empty path).
/// * Returns [`StorageError::CreateParentDir`] if creating missing parent directories fails.
/// * Returns [`StorageError::Io`] if creating, opening, or writing to the file fails.
///
/// # Examples
/// ```no_run
/// use std::path::Path;
/// use dybuk::storage::save_file;
///
/// let path = Path::new("notes/daily/journal.md");
/// let text = "# Daily Journal\nToday was productive!";
/// save_file(path, text).expect("Failed to save note");
/// ```
pub fn save_file(path: &Path, content: &str) -> Result<(), StorageError> {
    // Step 1: Check if the path has a valid parent directory.
    // In Rust, Path::parent() returns:
    // - None for empty paths ("") or root ("/", "C:\")
    // - Some("") for simple file names like "note.md" (meaning current directory)
    // - Some("folder/subfolder") for paths with directories
    let parent = path.parent().ok_or_else(|| StorageError::NoParentDirectory {
        path: path.to_path_buf(),
    })?;

    // Step 2: If the parent path is not empty and doesn't exist yet on disk, create it.
    // std::fs::create_dir_all is idempotent and creates all missing ancestor directories.
    if !parent.as_os_str().is_empty() && !parent.exists() {
        std::fs::create_dir_all(parent).map_err(|source| StorageError::CreateParentDir {
            path: path.to_path_buf(),
            parent: parent.to_path_buf(),
            source,
        })?;
    }

    // Step 3: Write the string content to disk.
    // std::fs::write handles opening the file in write mode, truncating any existing content,
    // and flushing the bytes to disk.
    std::fs::write(path, content).map_err(|source| StorageError::Io {
        path: path.to_path_buf(),
        source,
    })?;

    Ok(())
}

/// Loads and decodes a UTF-8 markdown file from the specified file path.
///
/// # Behavior
/// 1. Reads the raw byte stream from the file at `path`.
/// 2. Verifies and decodes the bytes into a valid Rust UTF-8 [`String`].
///
/// # Arguments
/// * `path` - The filesystem path of the markdown file to read.
///
/// # Errors
/// * Returns [`StorageError::Io`] if the file does not exist, cannot be opened, or fails during read.
/// * Returns [`StorageError::InvalidUtf8`] if the file bytes are not valid UTF-8 text (e.g. binary file).
///
/// # Examples
/// ```no_run
/// use std::path::Path;
/// use dybuk::storage::load_file;
///
/// let path = Path::new("notes/daily/journal.md");
/// let content = load_file(path).expect("Failed to load note");
/// println!("File contents:\n{}", content);
/// ```
pub fn load_file(path: &Path) -> Result<String, StorageError> {
    // Step 1: Read the raw bytes from the file on disk.
    // We read raw bytes first instead of read_to_string directly so we can provide
    // distinct error variants for I/O errors vs UTF-8 decoding issues.
    let bytes = std::fs::read(path).map_err(|source| StorageError::Io {
        path: path.to_path_buf(),
        source,
    })?;

    // Step 2: Convert the raw bytes into a valid UTF-8 String.
    // If the file contains non-UTF-8 bytes (like a binary or corrupted file),
    // String::from_utf8 will cleanly return a FromUtf8Error which we wrap in InvalidUtf8.
    let content = String::from_utf8(bytes).map_err(|source| StorageError::InvalidUtf8 {
        path: path.to_path_buf(),
        source,
    })?;

    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_save_and_load_roundtrip() {
        // Create a temporary sandbox directory that automatically cleans up when dropped.
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let file_path = temp_dir.path().join("my_note.md");
        let sample_text = "# Hello Dybuk\n\nThis is a sample markdown document with UTF-8 chars: 🦀 🚀";

        // Save the file for the first time.
        let save_result = save_file(&file_path, sample_text);
        assert!(save_result.is_ok(), "Saving file should succeed");

        // Load the file back and verify content matches exactly.
        let loaded_text = load_file(&file_path).expect("Loading saved file should succeed");
        assert_eq!(loaded_text, sample_text, "Loaded text must match saved text");

        // Overwrite the file with updated content.
        let updated_text = "# Hello Dybuk\n\nUpdated content!";
        let overwrite_result = save_file(&file_path, updated_text);
        assert!(overwrite_result.is_ok(), "Overwriting file should succeed");

        let reloaded_text = load_file(&file_path).expect("Loading overwritten file should succeed");
        assert_eq!(reloaded_text, updated_text, "Reloaded text must reflect the overwrite");
    }

    #[test]
    fn test_save_creates_missing_parent_directories() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        // Specify a deeply nested path where 'nested' and 'subfolder' directories do not exist yet.
        let deep_path = temp_dir.path().join("nested").join("subfolder").join("document.md");
        let content = "# Deeply Nested Document\nAutomatically creates folders!";

        // Ensure parent directories do not exist before save.
        let parent_dir = deep_path.parent().unwrap();
        assert!(!parent_dir.exists(), "Parent directory should not exist yet");

        // Save the file, which should trigger automatic directory creation.
        let save_result = save_file(&deep_path, content);
        assert!(save_result.is_ok(), "save_file should create all missing parent directories");

        // Verify the directories and file now exist.
        assert!(parent_dir.exists(), "Parent directories must have been created");
        assert!(deep_path.exists(), "Target file must exist on disk");

        // Verify we can load the content back without issues.
        let loaded = load_file(&deep_path).expect("Loading from deep path should succeed");
        assert_eq!(loaded, content);
    }

    #[test]
    fn test_load_nonexistent_file_returns_io_error() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let non_existent_file = temp_dir.path().join("does_not_exist.md");

        let result = load_file(&non_existent_file);
        assert!(result.is_err(), "Loading a nonexistent file must fail");

        // Verify the error variant is StorageError::Io with NotFound kind.
        match result.unwrap_err() {
            StorageError::Io { path, source } => {
                assert_eq!(path, non_existent_file);
                assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
            }
            other => panic!("Expected StorageError::Io, got {:?}", other),
        }
    }

    #[test]
    fn test_load_invalid_utf8_returns_invalid_utf8_error() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let binary_file = temp_dir.path().join("invalid.md");

        // Write invalid UTF-8 byte sequences directly to disk (e.g. isolated 0xFF byte).
        let invalid_bytes = vec![0xFF, 0xFE, 0xFD];
        std::fs::write(&binary_file, invalid_bytes).expect("Failed to write test bytes");

        // Attempting to load this should fail with InvalidUtf8 error variant.
        let result = load_file(&binary_file);
        assert!(result.is_err(), "Loading invalid UTF-8 must fail");

        match result.unwrap_err() {
            StorageError::InvalidUtf8 { path, .. } => {
                assert_eq!(path, binary_file);
            }
            other => panic!("Expected StorageError::InvalidUtf8, got {:?}", other),
        }
    }

    #[test]
    fn test_save_empty_path_returns_no_parent_directory() {
        let empty_path = Path::new("");
        let result = save_file(empty_path, "some content");
        assert!(result.is_err(), "Saving to an empty path must fail");

        match result.unwrap_err() {
            StorageError::NoParentDirectory { path } => {
                assert_eq!(path, PathBuf::from(""));
            }
            other => panic!("Expected StorageError::NoParentDirectory, got {:?}", other),
        }
    }
}

