//! # Symmetric Cipher Module (AES-256-GCM)
//!
//! This module handles authenticated symmetric encryption and decryption using AES-256-GCM
//! (Galois/Counter Mode). AES-GCM provides both confidentiality (protecting message contents)
//! and integrity/authenticity (detecting any unauthorized tampering via an authentication tag).
//!
//! # Security Guarantees
//! - **Key Size:** 256 bits (32 bytes)
//! - **Nonce Size:** 96 bits (12 bytes), generated randomly per encryption via CSPRNG
//! - **Authentication Tag:** 128 bits (16 bytes), verified automatically during decryption
//! - **Decryption Memory Protection:** Decrypted plaintext is wrapped in [`zeroize::Zeroizing`]

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::RngCore;
use zeroize::Zeroizing;

use crate::crypto::error::CryptoError;

/// Generates a cryptographically secure 12-byte (96-bit) nonce for AES-256-GCM.
///
/// # Security Critical Note
/// In GCM mode, a nonce MUST NEVER be reused with the same key. Reusing a nonce
/// destroys GCM's authenticity guarantee and can leak plaintext. We generate a fresh
/// nonce from the OS CSPRNG for every single encryption operation.
#[must_use]
pub(crate) fn generate_nonce() -> [u8; 12] {
    // Step 1: Allocate a 12-byte array on the stack.
    let mut nonce = [0u8; 12];

    // Step 2: Populate with cryptographically secure random bytes from OS CSPRNG.
    rand::rngs::OsRng.fill_bytes(&mut nonce);

    nonce
}

/// Encrypts plaintext bytes using AES-256-GCM with the provided key and nonce.
///
/// # Arguments
/// * `plaintext` - The unencrypted raw bytes (e.g. UTF-8 markdown string bytes).
/// * `key` - A 32-byte (256-bit) symmetric key derived from Argon2id.
/// * `nonce` - A unique 12-byte nonce generated for this specific encryption pass.
///
/// # Errors
/// * Returns [`CryptoError::EncryptionFailed`] if encryption cannot be completed.
///
/// # Returns
/// A `Vec<u8>` containing the ciphertext with the appended 16-byte Poly1305 authentication tag.
pub(crate) fn encrypt(
    plaintext: &[u8],
    key: &[u8; 32],
    nonce: &[u8; 12],
) -> Result<Vec<u8>, CryptoError> {
    // Step 1: Instantiate the AES-256-GCM cipher using the 32-byte key.
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));

    // Step 2: Wrap the 12-byte slice as a GCM Nonce.
    let gcm_nonce = Nonce::from_slice(nonce);

    // Step 3: Perform authenticated encryption.
    // aes-gcm appends the 16-byte authentication tag to the end of the ciphertext Vec.
    cipher
        .encrypt(gcm_nonce, plaintext)
        .map_err(|_| CryptoError::EncryptionFailed)
}

/// Decrypts ciphertext bytes using AES-256-GCM with the provided key and nonce.
///
/// # Arguments
/// * `ciphertext` - The encrypted bytes (including the 16-byte authentication tag).
/// * `key` - The 32-byte symmetric key to attempt decryption with.
/// * `nonce` - The 12-byte nonce used during encryption.
///
/// # Errors
/// * Returns [`CryptoError::DecryptionFailed`] if the key is incorrect, the nonce is wrong,
///   or any byte of the ciphertext/tag has been modified.
///
/// # Returns
/// The decrypted plaintext wrapped in [`Zeroizing`] so it is erased from memory on drop.
pub(crate) fn decrypt(
    ciphertext: &[u8],
    key: &[u8; 32],
    nonce: &[u8; 12],
) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
    // Step 1: Instantiate the AES-256-GCM cipher.
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));

    // Step 2: Wrap the 12-byte slice as a GCM Nonce.
    let gcm_nonce = Nonce::from_slice(nonce);

    // Step 3: Decrypt and verify authentication tag.
    // If the key is wrong or any bit of ciphertext is flipped, aes-gcm returns an error.
    let plaintext_bytes = cipher
        .decrypt(gcm_nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    // Step 4: Wrap the decrypted bytes in Zeroizing so memory is scrubbed on drop.
    Ok(Zeroizing::new(plaintext_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_nonce_is_non_zero_and_unique() {
        let nonce1 = generate_nonce();
        let nonce2 = generate_nonce();

        assert_ne!(nonce1, [0u8; 12], "Nonce should not be all zeroes");
        assert_ne!(nonce2, [0u8; 12], "Nonce should not be all zeroes");
        assert_ne!(nonce1, nonce2, "Consecutive nonces must be unique");
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip_matches_original() {
        let key = [0x5Au8; 32]; // Sample 32-byte key
        let nonce = generate_nonce();
        let original_text = b"# Classified Thoughts\nSecret confidential markdown.";

        // Encrypt the plaintext.
        let ciphertext = encrypt(original_text, &key, &nonce).expect("Encryption failed");

        // Verify ciphertext is not plaintext and is longer (due to 16-byte auth tag).
        assert_ne!(&ciphertext[..], original_text);
        assert_eq!(ciphertext.len(), original_text.len() + 16);

        // Decrypt back.
        let decrypted = decrypt(&ciphertext, &key, &nonce).expect("Decryption failed");
        assert_eq!(&*decrypted, original_text);
    }

    #[test]
    fn test_decrypt_with_wrong_key_fails() {
        let correct_key = [0x11u8; 32];
        let wrong_key = [0x22u8; 32];
        let nonce = generate_nonce();
        let original_text = b"Secret data";

        let ciphertext = encrypt(original_text, &correct_key, &nonce).expect("Encryption failed");

        // Attempting to decrypt with an incorrect key MUST fail.
        let result = decrypt(&ciphertext, &wrong_key, &nonce);
        assert_eq!(
            result.unwrap_err(),
            CryptoError::DecryptionFailed,
            "Decryption with wrong key must return DecryptionFailed"
        );
    }

    #[test]
    fn test_decrypt_with_tampered_ciphertext_fails() {
        let key = [0x33u8; 32];
        let nonce = generate_nonce();
        let original_text = b"Important uncorrupted text";

        let mut ciphertext = encrypt(original_text, &key, &nonce).expect("Encryption failed");

        // Tamper with one single byte in the ciphertext (flip a bit).
        ciphertext[0] ^= 0x01;

        // AES-GCM authentication tag verification must catch this tampering.
        let result = decrypt(&ciphertext, &key, &nonce);
        assert_eq!(
            result.unwrap_err(),
            CryptoError::DecryptionFailed,
            "Decryption of tampered ciphertext must fail authentication check"
        );
    }

    #[test]
    fn test_decrypt_with_wrong_nonce_fails() {
        let key = [0x44u8; 32];
        let nonce = generate_nonce();
        let wrong_nonce = generate_nonce();
        let original_text = b"Top secret";

        let ciphertext = encrypt(original_text, &key, &nonce).expect("Encryption failed");

        // Decrypting with mismatched nonce must fail.
        let result = decrypt(&ciphertext, &key, &wrong_nonce);
        assert_eq!(
            result.unwrap_err(),
            CryptoError::DecryptionFailed,
            "Decryption with incorrect nonce must fail"
        );
    }
}

