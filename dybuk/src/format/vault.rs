//! # Vault Serialization & Cryptographic Container Module
//!
//! This module implements the `.dybuk` binary container format, providing functions
//! to [`seal`] plaintext into an encrypted file and [`open`] an encrypted file back into plaintext.
//!
//! # Binary Layout Specification
//! A `.dybuk` file consists of the following contiguous byte sections:
//! ```text
//! +---------------+-----------------+------------------+------------------+-----------------------+
//! | Magic (4 B)   | Version (1 B)   | Salt (16 B)      | Nonce (12 B)     | Ciphertext (variable) |
//! | "DYBK"        | 0x01            | CSPRNG Salt      | AES-GCM Nonce    | AES-256-GCM + 16B Tag |
//! +---------------+-----------------+------------------+------------------+-----------------------+
//! 0               4                 5                  21                 33                     EOF
//! ```
//!
//! # Key Security Features
//! - **Per-File Salt:** Every sealed file gets a unique 16-byte random salt.
//! - **Per-File Nonce:** Every encryption generates a fresh 12-byte random nonce.
//! - **Authenticated Encryption:** Tampering with any byte causes decryption to fail.
//! - **Memory Protection:** Plaintext and key material are returned wrapped in [`Zeroizing`].
//! - **Panic-Safe Parsing:** All byte slicing uses explicit bounds checks to ensure safety on untrusted files.

use zeroize::Zeroizing;

use crate::crypto::{cipher, kdf};
use crate::format::error::FormatError;
use crate::format::header::{self, HEADER_SIZE};

/// The minimum number of bytes required to parse the header, salt, and nonce (5 + 16 + 12 = 33).
const MIN_VAULT_HEADER_SIZE: usize = HEADER_SIZE + 16 + 12;

/// Length of the cryptographic salt in bytes.
const SALT_SIZE: usize = 16;

/// Length of the AES-GCM nonce in bytes.
const NONCE_SIZE: usize = 12;

/// Encrypts and serializes plaintext markdown content into the `.dybuk` binary vault format.
///
/// # Behavior
/// 1. Generates a fresh 16-byte CSPRNG salt.
/// 2. Derives a 256-bit encryption key from the password and salt using Argon2id.
/// 3. Generates a fresh 12-byte CSPRNG nonce for AES-256-GCM.
/// 4. Encrypts the plaintext bytes with AES-256-GCM.
/// 5. Assembles and returns the final byte buffer: `[magic: 4][version: 1][salt: 16][nonce: 12][ciphertext: variable]`.
///
/// # Arguments
/// * `plaintext` - The unencrypted UTF-8 markdown string to protect.
/// * `password` - The user's passphrase for encryption.
///
/// # Errors
/// * Returns [`FormatError::Crypto`] if key derivation or encryption fails.
///
/// # Examples
/// ```no_run
/// use dybuk::format::vault::seal;
///
/// let payload = seal("# Secret Notes", "master_pass_123").expect("Failed to seal document");
/// assert!(payload.starts_with(b"DYBK\x01"));
/// ```
pub fn seal(plaintext: &str, password: &str) -> Result<Vec<u8>, FormatError> {
    // Step 1: Generate a fresh 16-byte random salt for Argon2id key derivation.
    let salt = kdf::generate_salt();

    // Step 2: Derive a 32-byte (256-bit) symmetric encryption key.
    let key = kdf::derive_key(password.as_bytes(), &salt)?;

    // Step 3: Generate a fresh 12-byte random nonce for AES-256-GCM.
    let nonce = cipher::generate_nonce();

    // Step 4: Encrypt the UTF-8 plaintext bytes.
    let ciphertext = cipher::encrypt(plaintext.as_bytes(), &key, &nonce)?;

    // Step 5: Allocate the final payload vector with exact capacity to avoid reallocations.
    let mut payload = Vec::with_capacity(MIN_VAULT_HEADER_SIZE + ciphertext.len());

    // Step 6: Write header (magic bytes + format version).
    header::write_header(&mut payload);

    // Step 7: Append salt, nonce, and ciphertext payload.
    payload.extend_from_slice(&salt);
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&ciphertext);

    Ok(payload)
}

/// Decrypts and deserializes a `.dybuk` binary payload back into a UTF-8 string.
///
/// # Behavior
/// 1. Performs strict bounds checking to ensure the data is at least 33 bytes.
/// 2. Validates the magic signature (`DYBK`) and format version byte.
/// 3. Extracts the 16-byte salt and 12-byte nonce by fixed byte offsets.
/// 4. Derives the symmetric key from the password and extracted salt.
/// 5. Decrypts the remaining ciphertext slice using AES-256-GCM.
/// 6. Decodes the decrypted bytes into a valid UTF-8 [`String`].
///
/// # Arguments
/// * `data` - The raw byte slice of the `.dybuk` file.
/// * `password` - The user's passphrase to unlock the document.
///
/// # Errors
/// * Returns [`FormatError::TruncatedData`] if `data` is shorter than the minimum header size (33 bytes).
/// * Returns [`FormatError::InvalidMagicBytes`] if the file does not begin with `DYBK`.
/// * Returns [`FormatError::UnsupportedVersion`] if the version byte is not 1.
/// * Returns [`FormatError::Crypto`] if the password is incorrect or data was tampered with.
/// * Returns [`FormatError::InvalidUtf8`] if decrypted plaintext is not valid UTF-8.
///
/// # Returns
/// The decrypted markdown text wrapped in [`Zeroizing<String>`] so it is wiped from RAM on drop.
pub fn open(data: &[u8], password: &str) -> Result<Zeroizing<String>, FormatError> {
    // Step 1: Strict bounds check for the entire header overhead (magic + version + salt + nonce = 33 bytes).
    if data.len() < MIN_VAULT_HEADER_SIZE {
        return Err(FormatError::TruncatedData {
            expected_at_least: MIN_VAULT_HEADER_SIZE,
            found: data.len(),
        });
    }

    // Step 2: Validate the 5-byte header (magic bytes + version).
    header::parse_header(&data[..HEADER_SIZE])?;

    // Step 3: Extract the 16-byte salt (bytes 5..21).
    let mut salt = [0u8; SALT_SIZE];
    salt.copy_from_slice(&data[HEADER_SIZE..HEADER_SIZE + SALT_SIZE]);

    // Step 4: Extract the 12-byte nonce (bytes 21..33).
    let nonce_start = HEADER_SIZE + SALT_SIZE;
    let nonce_end = nonce_start + NONCE_SIZE;
    let mut nonce = [0u8; NONCE_SIZE];
    nonce.copy_from_slice(&data[nonce_start..nonce_end]);

    // Step 5: Slicing the remaining bytes as ciphertext (bytes 33..end).
    let ciphertext = &data[nonce_end..];

    // Step 6: Derive the 32-byte encryption key from the provided password and salt.
    let key = kdf::derive_key(password.as_bytes(), &salt)?;

    // Step 7: Decrypt the ciphertext with AES-256-GCM.
    let mut decrypted_bytes = cipher::decrypt(ciphertext, &key, &nonce)?;

    // Step 8: Safely convert decrypted bytes into a UTF-8 String without extra intermediate copies in RAM.
    let byte_vec = std::mem::take(&mut *decrypted_bytes);
    let content = String::from_utf8(byte_vec).map_err(|source| FormatError::InvalidUtf8 { source })?;

    Ok(Zeroizing::new(content))
}

/// Derives a 32-byte symmetric key for caching in the in-memory [`crate::session::SessionStore`].
///
/// This avoids re-running expensive Argon2id computations repeatedly during the lifetime of an open file.
///
/// # Arguments
/// * `password` - The user's passphrase.
/// * `salt` - The 16-byte salt extracted from the target file.
///
/// # Errors
/// * Returns [`FormatError::Crypto`] if key derivation fails.
pub fn derive_key_for_session(
    password: &str,
    salt: &[u8; 16],
) -> Result<Zeroizing<[u8; 32]>, FormatError> {
    kdf::derive_key(password.as_bytes(), salt).map_err(FormatError::Crypto)
}

/// Extracts only the 16-byte cryptographic salt from a `.dybuk` byte payload.
///
/// This allows callers (e.g. document creation or unlocking workflows) to derive session keys
/// without having to perform a full file decrypt.
///
/// # Arguments
/// * `data` - A byte slice containing at least the header and salt of a `.dybuk` file (at least 21 bytes).
///
/// # Errors
/// * Returns [`FormatError::TruncatedData`] if `data.len() < 21`.
/// * Returns [`FormatError::InvalidMagicBytes`] or [`FormatError::UnsupportedVersion`] on invalid header.
pub fn extract_salt(data: &[u8]) -> Result<[u8; 16], FormatError> {
    let required_len = HEADER_SIZE + SALT_SIZE;
    if data.len() < required_len {
        return Err(FormatError::TruncatedData {
            expected_at_least: required_len,
            found: data.len(),
        });
    }

    // Validate the 5-byte header first.
    header::parse_header(&data[..HEADER_SIZE])?;

    // Extract the 16-byte salt from bytes 5..21.
    let mut salt = [0u8; SALT_SIZE];
    salt.copy_from_slice(&data[HEADER_SIZE..required_len]);

    Ok(salt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seal_and_open_roundtrip() {
        let plaintext = "# My Highly Confidential Diary\n\n- Point 1: Secure!\n- Point 2: Argon2id!";
        let password = "correct_horse_battery_staple";

        // Seal into encrypted vault payload.
        let sealed_data = seal(plaintext, password).expect("Sealing should succeed");

        // Verify minimum format structure.
        assert!(sealed_data.len() >= MIN_VAULT_HEADER_SIZE);
        assert_eq!(&sealed_data[0..4], b"DYBK");
        assert_eq!(sealed_data[4], 1);

        // Open with correct password.
        let opened_text = open(&sealed_data, password).expect("Opening with correct password should succeed");
        assert_eq!(&*opened_text, plaintext);
    }

    #[test]
    fn test_seal_empty_plaintext_roundtrip() {
        let plaintext = "";
        let password = "sample_password";

        let sealed = seal(plaintext, password).expect("Sealing empty plaintext should succeed");
        let opened = open(&sealed, password).expect("Opening empty plaintext should succeed");
        assert_eq!(&*opened, "");
    }

    #[test]
    fn test_open_with_wrong_password_fails() {
        let plaintext = "Important secret";
        let correct_password = "password123";
        let wrong_password = "wrong_password";

        let sealed = seal(plaintext, correct_password).expect("Sealing should succeed");
        let result = open(&sealed, wrong_password);

        assert!(result.is_err());
        match result.unwrap_err() {
            FormatError::Crypto(_) => (),
            other => panic!("Expected FormatError::Crypto, got {:?}", other),
        }
    }

    #[test]
    fn test_open_with_corrupted_magic_fails() {
        let plaintext = "Hello";
        let password = "pass";

        let mut sealed = seal(plaintext, password).expect("Sealing should succeed");
        // Corrupt magic bytes
        sealed[0] = b'X';

        let result = open(&sealed, password);
        assert!(result.is_err());
        match result.unwrap_err() {
            FormatError::InvalidMagicBytes => (),
            other => panic!("Expected InvalidMagicBytes, got {:?}", other),
        }
    }

    #[test]
    fn test_open_with_unsupported_version_fails() {
        let plaintext = "Hello";
        let password = "pass";

        let mut sealed = seal(plaintext, password).expect("Sealing should succeed");
        // Set unsupported version
        sealed[4] = 99;

        let result = open(&sealed, password);
        assert!(result.is_err());
        match result.unwrap_err() {
            FormatError::UnsupportedVersion { found } => {
                assert_eq!(found, 99);
            }
            other => panic!("Expected UnsupportedVersion, got {:?}", other),
        }
    }

    #[test]
    fn test_open_truncated_data_fails_gracefully_without_panic() {
        let password = "pass";
        let test_sizes = [0, 1, 4, 5, 10, 20, 32];

        for size in test_sizes {
            let truncated_buffer = vec![b'A'; size];
            let result = open(&truncated_buffer, password);
            assert!(
                result.is_err(),
                "Truncated buffer of size {} must fail gracefully",
                size
            );
            match result.unwrap_err() {
                FormatError::TruncatedData {
                    expected_at_least,
                    found,
                } => {
                    assert_eq!(expected_at_least, MIN_VAULT_HEADER_SIZE);
                    assert_eq!(found, size);
                }
                other => panic!("Expected TruncatedData, got {:?}", other),
            }
        }
    }

    #[test]
    fn test_extract_salt_matches_sealed_salt() {
        let plaintext = "Document with salt";
        let password = "secure_passphrase";

        let sealed = seal(plaintext, password).expect("Sealing should succeed");
        let extracted_salt = extract_salt(&sealed).expect("Salt extraction should succeed");

        // The salt is stored at bytes 5..21 in the sealed buffer.
        assert_eq!(extracted_salt, sealed[5..21]);

        // Key derived via extracted salt and derive_key_for_session must be valid
        let session_key = derive_key_for_session(password, &extracted_salt)
            .expect("Session key derivation should succeed");
        assert_eq!(session_key.len(), 32);
    }

    #[test]
    fn test_extract_salt_truncated_fails() {
        let short_data = [b'D', b'Y', b'B', b'K', 1, 0x01, 0x02]; // only 7 bytes, need 21
        let result = extract_salt(&short_data);
        assert!(result.is_err());
        match result.unwrap_err() {
            FormatError::TruncatedData {
                expected_at_least,
                found,
            } => {
                assert_eq!(expected_at_least, 21);
                assert_eq!(found, 7);
            }
            other => panic!("Expected TruncatedData, got {:?}", other),
        }
    }
}

