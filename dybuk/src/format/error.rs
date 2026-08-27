//! # Format Error Module
//!
//! Defines error types that can occur during binary serialization, deserialization,
//! header parsing, and cryptographic verification of `.dybuk` vault files.

use thiserror::Error;

use crate::crypto::error::CryptoError;

/// Errors that can occur when reading, parsing, or opening a `.dybuk` encrypted file.
#[derive(Debug, Error)]
pub enum FormatError {
    /// The file does not start with the mandatory magic signature bytes (`DYBK`).
    #[error("Invalid magic bytes: file does not match expected Dybuk header")]
    InvalidMagicBytes,

    /// The vault file version is not supported by this version of Dybuk.
    #[error("Unsupported vault format version: found version {found}, expected 1")]
    UnsupportedVersion {
        /// The version byte encountered in the file header.
        found: u8,
    },

    /// The data buffer is shorter than the minimum required size for the operation.
    #[error("Truncated vault data: expected at least {expected_at_least} bytes, found {found}")]
    TruncatedData {
        /// The minimum number of bytes expected.
        expected_at_least: usize,
        /// The actual number of bytes present in the buffer.
        found: usize,
    },

    /// The decrypted byte payload could not be decoded as a valid UTF-8 string.
    #[error("Decrypted content is not valid UTF-8 text: {source}")]
    InvalidUtf8 {
        /// The underlying UTF-8 conversion error.
        #[source]
        source: std::string::FromUtf8Error,
    },

    /// An underlying cryptographic failure occurred (e.g. invalid password, key derivation failure).
    #[error("Cryptographic operation failed: {0}")]
    Crypto(#[from] CryptoError),
}

