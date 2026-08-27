//! # Internal Cryptography Subsystem
//!
//! This module provides cryptographic primitives for key derivation (Argon2id)
//! and authenticated symmetric encryption/decryption (AES-256-GCM).
//!
//! # Visibility Note
//! All items in this module are strictly `pub(crate)` and are not exposed directly at the
//! crate root. Outside callers interact with vault cryptography exclusively through
//! the higher-level [`crate::format::vault`] API.

pub(crate) mod cipher;
pub(crate) mod error;
pub(crate) mod kdf;

