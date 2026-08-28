//! # Dybuk Core Library
//!
//! Core business logic, storage engine, cryptography, and data structures for Dybuk,
//! a cross-platform secure markdown editor.
//!
//! ## Modules
//! - [`storage`]: Plain markdown file reading, writing, and directory management.
//! - [`recents`]: Tracking, persisting, deduplicating, and pruning recent document history.
//! - [`crypto`]: Internal cryptographic primitives (Argon2id KDF, AES-256-GCM cipher).
//! - [`format`]: Binary serialization and validation for encrypted `.dybuk` vault files.
//! - [`session`]: In-memory session key cache for unlocked documents.
//! - [`document`]: Unified document creation entry point for `.md` and `.dybuk` formats.

pub(crate) mod crypto;
pub mod document;
pub mod format;
pub mod markdown;
pub mod recents;
pub mod session;
pub mod storage;

// Re-export storage API for convenient top-level access.
pub use storage::{load_file, save_file, StorageError};

// Re-export recents API for convenient top-level access.
pub use recents::{
    add_recent, list_recents, validate_and_prune, RecentEntry, RecentsError,
};

// Re-export session store for in-memory key caching.
pub use session::SessionStore;

// Re-export unified document creation API and types.
pub use document::{create_document, CreatedDocument, DocumentError, NewDocument};

// Re-export public vault encryption/decryption functions.
pub use format::vault::{open, seal};

// Re-export markdown-to-HTML rendering engine.
pub use markdown::render_to_html;

/// Current version of the `dybuk` crate as defined in Cargo.toml.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
