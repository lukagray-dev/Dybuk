//! # Dybuk Core Library
//!
//! Core business logic, storage engine, cryptography, and data structures for Dybuk,
//! a cross-platform secure markdown editor.
//!
//! ## Modules
//! - [`storage`]: Plain markdown file reading, writing, and directory management.
//! - [`recents`]: Tracking, persisting, deduplicating, and pruning recent document history.

pub mod recents;
pub mod storage;

// Re-export storage API for convenient top-level access.
pub use storage::{load_file, save_file, StorageError};

// Re-export recents API for convenient top-level access.
pub use recents::{
    add_recent, list_recents, validate_and_prune, RecentEntry, RecentsError,
};

/// Current version of the `dybuk` crate as defined in Cargo.toml.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
