//! # Unified Document Creation Module
//!
//! This module provides a single, unified entry point ([`create_document`]) for initializing
//! new files on disk, supporting both plain unencrypted markdown (`.md`) documents and
//! encrypted Dybuk vaults (`.dybuk`).
//!
//! # Architecture & Decoupling
//! - **Filesystem Isolation:** Handles automatic parent directory creation regardless of document type.
//! - **Session Store Independence:** When a `.dybuk` vault is created, this module computes and
//!   returns the derived session key in [`CreatedDocument::session_key`]. It **does not** mutate
//!   the [`crate::session::SessionStore`] directly, keeping document creation pure, decoupled, and easy to test.
//!   The caller (e.g. Tauri command handler) takes responsibility for caching the key into state.
//! - **Storage Separation:** While plain markdown documents use [`crate::storage::save_file`], `.dybuk` files
//!   contain raw encrypted binary bytes and are written directly using `std::fs::write` after verifying/creating
//!   parent directories. This preserves the strict UTF-8 invariants of the `storage` module.

use std::path::{Path, PathBuf};
use thiserror::Error;
use zeroize::Zeroizing;

use crate::format::vault;
use crate::format::FormatError;
use crate::storage::{self, StorageError};

/// Specifies the format and initialization parameters when creating a new document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NewDocument {
    /// A standard, unencrypted markdown file (`.md`).
    Markdown,

    /// A secure, encrypted `.dybuk` vault file protected by a passphrase.
    Dybuk {
        /// The user-provided passphrase used for initial encryption and key derivation.
        password: String,
    },
}

/// Errors that can occur during document initialization and creation.
#[derive(Debug, Error)]
pub enum DocumentError {
    /// Filesystem error during directory creation or file writing.
    #[error("Storage error: {0}")]
    Storage(#[from] StorageError),

    /// Formatting or cryptographic error during vault creation.
    #[error("Format error: {0}")]
    Format(#[from] FormatError),
}

/// Metadata and state returned after a document is successfully created on disk.
#[derive(Debug)]
pub struct CreatedDocument {
    /// The canonical filesystem path of the newly created file.
    pub path: PathBuf,

    /// The derived 32-byte encryption key for immediate session caching.
    ///
    /// - `Some(key)` if the created document is an encrypted `.dybuk` vault.
    /// - `None` if the created document is a plain `.md` file.
    pub session_key: Option<Zeroizing<[u8; 32]>>,
}

/// Creates a new empty document on disk of the specified kind.
///
/// # Behavior
/// 1. Verifies that the path has a valid parent directory and creates all missing parent directories.
/// 2. If `kind` is [`NewDocument::Markdown`]:
///    - Calls [`storage::save_file`] with empty string `""`.
///    - Returns [`CreatedDocument`] with `session_key: None`.
/// 3. If `kind` is [`NewDocument::Dybuk`]:
///    - Calls [`vault::seal`] with empty string `""` and the provided password.
///    - Writes the sealed binary payload to disk.
///    - Extracts the salt via [`vault::extract_salt`].
///    - Derives the 32-byte session key via [`vault::derive_key_for_session`].
///    - Returns [`CreatedDocument`] with `session_key: Some(key)`.
///
/// # Arguments
/// * `path` - Destination filesystem path for the new file (e.g. `notes/my_doc.md` or `notes/my_doc.dybuk`).
/// * `kind` - The document kind ([`NewDocument::Markdown`] or [`NewDocument::Dybuk`]).
///
/// # Errors
/// * Returns [`DocumentError::Storage`] if parent directory creation or writing to disk fails.
/// * Returns [`DocumentError::Format`] if vault sealing, salt extraction, or key derivation fails.
///
/// # Examples
/// ```no_run
/// use std::path::Path;
/// use dybuk::{create_document, NewDocument};
///
/// // Create plain markdown
/// let doc = create_document(Path::new("notes/todo.md"), NewDocument::Markdown)
///     .expect("Failed to create markdown document");
/// assert!(doc.session_key.is_none());
///
/// // Create encrypted vault
/// let vault = create_document(
///     Path::new("notes/secrets.dybuk"),
///     NewDocument::Dybuk { password: "secure_passphrase_123".to_string() }
/// ).expect("Failed to create vault document");
/// assert!(vault.session_key.is_some());
/// ```
pub fn create_document(path: &Path, kind: NewDocument) -> Result<CreatedDocument, DocumentError> {
    match kind {
        NewDocument::Markdown => {
            // Step 1: Save an empty UTF-8 markdown file using the storage module.
            // storage::save_file takes care of parent directory creation.
            storage::save_file(path, "")?;

            Ok(CreatedDocument {
                path: path.to_path_buf(),
                session_key: None,
            })
        }
        NewDocument::Dybuk { password } => {
            // Step 1: Seal an empty plaintext payload with the user's password.
            let sealed_bytes = vault::seal("", &password)?;

            // Step 2: Ensure parent directories exist before writing binary payload.
            // We implement directory checking here because storage::save_file is strictly UTF-8 text focused,
            // while .dybuk files are binary encrypted streams.
            let parent = path
                .parent()
                .ok_or_else(|| StorageError::NoParentDirectory {
                    path: path.to_path_buf(),
                })?;

            if !parent.as_os_str().is_empty() && !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|source| StorageError::CreateParentDir {
                    path: path.to_path_buf(),
                    parent: parent.to_path_buf(),
                    source,
                })?;
            }

            // Step 3: Write raw encrypted bytes to disk.
            std::fs::write(path, &sealed_bytes).map_err(|source| StorageError::Io {
                path: path.to_path_buf(),
                source,
            })?;

            // Step 4: Extract salt from the newly sealed bytes to derive the session key.
            let salt = vault::extract_salt(&sealed_bytes)?;

            // Step 5: Derive the session key so the caller can immediately cache it in SessionStore.
            let session_key = vault::derive_key_for_session(&password, &salt)?;

            Ok(CreatedDocument {
                path: path.to_path_buf(),
                session_key: Some(session_key),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_create_markdown_document_success() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let md_path = temp_dir.path().join("test_note.md");

        let result = create_document(&md_path, NewDocument::Markdown);
        assert!(result.is_ok(), "Creating markdown document should succeed");

        let doc = result.unwrap();
        assert_eq!(doc.path, md_path);
        assert!(doc.session_key.is_none(), "Markdown documents do not have session keys");

        // Verify the file exists on disk and is empty
        let content = std::fs::read_to_string(&md_path).expect("File should exist");
        assert_eq!(content, "");
    }

    #[test]
    fn test_create_dybuk_document_success() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let dybuk_path = temp_dir.path().join("secure_vault.dybuk");
        let password = "my_vault_password";

        let result = create_document(
            &dybuk_path,
            NewDocument::Dybuk {
                password: password.to_string(),
            },
        );
        assert!(result.is_ok(), "Creating dybuk vault should succeed");

        let doc = result.unwrap();
        assert_eq!(doc.path, dybuk_path);
        assert!(doc.session_key.is_some(), "Dybuk documents must return a session key");

        // Verify file bytes on disk start with magic bytes "DYBK\x01"
        let disk_bytes = std::fs::read(&dybuk_path).expect("Vault file should exist on disk");
        assert!(disk_bytes.starts_with(b"DYBK\x01"));

        // Verify that the created file can be decrypted with vault::open and yields empty string
        let decrypted = vault::open(&disk_bytes, password).expect("Vault on disk should decrypt cleanly");
        assert_eq!(&*decrypted, "");
    }

    #[test]
    fn test_create_document_in_deeply_nested_directory() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let deep_path = temp_dir
            .path()
            .join("sub1")
            .join("sub2")
            .join("nested_vault.dybuk");

        let result = create_document(
            &deep_path,
            NewDocument::Dybuk {
                password: "nested_pass".to_string(),
            },
        );
        assert!(result.is_ok(), "Creating nested file should automatically create directories");

        assert!(deep_path.exists(), "Deeply nested file must exist on disk");
    }

    #[test]
    fn test_create_document_empty_path_returns_error() {
        let empty_path = Path::new("");
        let result = create_document(empty_path, NewDocument::Markdown);
        assert!(result.is_err(), "Creating with empty path must fail");

        match result.unwrap_err() {
            DocumentError::Storage(StorageError::NoParentDirectory { .. }) => (),
            other => panic!("Expected StorageError::NoParentDirectory, got {:?}", other),
        }
    }
}

