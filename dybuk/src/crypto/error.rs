//! # Cryptographic Error Types
//!
//! This module defines the error variants that can arise during cryptographic operations
//! such as password-based key derivation (KDF), symmetric encryption, and symmetric decryption.

use thiserror::Error;

/// Cryptographic errors that can occur during key derivation, encryption, or decryption.
#[derive(Debug, Error, PartialEq, Eq)]
#[allow(clippy::enum_variant_names)]
pub enum CryptoError {
    /// Key derivation using Argon2id failed.
    ///
    /// This may occur if the input parameters or memory limits could not be satisfied
    /// by the Argon2 engine.
    #[error("Key derivation failed")]
    KeyDerivationFailed,

    /// Symmetric encryption using AES-256-GCM failed.
    ///
    /// This can happen if the cipher encounters invalid parameters or buffer allocation issues.
    #[error("Encryption failed")]
    EncryptionFailed,

    /// Symmetric decryption using AES-256-GCM failed or authentication tag check failed.
    ///
    /// # Security Note on Generic Decryption Error
    /// This error is intentionally generic. We deliberately DO NOT distinguish between:
    /// 1. An incorrect password/key
    /// 2. Tampered ciphertext bytes
    /// 3. A corrupted or invalid authentication tag
    ///
    /// Distinguishing between these failure modes can leak side-channel information to an attacker
    /// (e.g., padding oracle or verification oracle attacks), allowing them to deduce whether their
    /// password guess was close or whether ciphertext alterations produced specific cryptographic states.
    #[error("Decryption failed")]
    DecryptionFailed,
}
