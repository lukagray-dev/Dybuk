//! # Vault Binary Format Subsystem
//!
//! Implements serialization, deserialization, and integrity validation for `.dybuk`
//! encrypted container files.
//!
//! # Public API
//! - [`vault::seal`]: Encrypt and format markdown text into a `.dybuk` payload.
//! - [`vault::open`]: Validate and decrypt a `.dybuk` payload into markdown text.
//! - [`error::FormatError`]: Error enum for all format-related failures.

pub(crate) mod error;
pub(crate) mod header;
pub mod vault;

pub use error::FormatError;

