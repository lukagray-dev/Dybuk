//! # Key Derivation Function (KDF) Module
//!
//! This module provides cryptographic key derivation using Argon2id.
//! Argon2id is a memory-hard key derivation function that resists both GPU/ASIC
//! cracking attacks and side-channel timing attacks.
//!
//! Key material derived here is always wrapped in [`zeroize::Zeroizing`] so that sensitive
//! bytes are securely wiped from RAM immediately when they go out of scope.

use rand::RngCore;
use zeroize::Zeroizing;

use crate::crypto::error::CryptoError;

/// Generates a cryptographically secure 16-byte random salt using the operating system's CSPRNG.
///
/// # Why Salts Matter
/// A salt ensures that two identical passwords produce completely different encryption keys,
/// rendering precomputed rainbow table attacks impossible.
#[must_use]
pub(crate) fn generate_salt() -> [u8; 16] {
    // Step 1: Allocate a 16-byte zeroed buffer on the stack.
    let mut salt = [0u8; 16];

    // Step 2: Fill the buffer with cryptographically secure random bytes from the OS (e.g. /dev/urandom or BCryptGenRandom).
    rand::rngs::OsRng.fill_bytes(&mut salt);

    salt
}

/// Derives a 256-bit (32-byte) symmetric encryption key from a user password and salt using Argon2id.
///
/// # Arguments
/// * `password` - The raw password bytes provided by the user.
/// * `salt` - A 16-byte cryptographic salt unique to this file.
///
/// # Errors
/// * Returns [`CryptoError::KeyDerivationFailed`] if Argon2id parameters fail or hashing fails.
///
/// # Returns
/// A 32-byte key wrapped in [`Zeroizing`] so that its memory is zeroed out on drop.
pub(crate) fn derive_key(
    password: &[u8],
    salt: &[u8; 16],
) -> Result<Zeroizing<[u8; 32]>, CryptoError> {
    // Step 1: Allocate a temporary 32-byte array to receive the derived key bytes.
    let mut key_bytes = [0u8; 32];

    // Step 2: Initialize Argon2id with default recommended parameters (Argon2id, memory-hard).
    let argon2 = argon2::Argon2::default();

    // Step 3: Compute the hash directly into our output buffer.
    argon2
        .hash_password_into(password, salt, &mut key_bytes)
        .map_err(|_| CryptoError::KeyDerivationFailed)?;

    // Step 4: Wrap the key in Zeroizing. When this struct is dropped, the memory is safely overwritten with zeros.
    Ok(Zeroizing::new(key_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_salt_is_non_zero_and_unique() {
        // Generating two random salts back-to-back should produce distinct 16-byte arrays.
        let salt1 = generate_salt();
        let salt2 = generate_salt();

        // Check that salts are non-empty and non-zero
        assert_ne!(salt1, [0u8; 16], "Generated salt should not be all zeroes");
        assert_ne!(salt2, [0u8; 16], "Generated salt should not be all zeroes");
        assert_ne!(
            salt1, salt2,
            "Consecutive OS RNG calls should produce distinct salts"
        );
    }

    #[test]
    fn test_derive_key_determinism() {
        let password = b"my_super_secret_master_password_123";
        let salt = [42u8; 16];

        // Deriving with identical password and salt MUST always produce the exact same key.
        let key1 = derive_key(password, &salt).expect("Key derivation 1 failed");
        let key2 = derive_key(password, &salt).expect("Key derivation 2 failed");

        assert_eq!(
            key1.len(),
            32,
            "Derived key must be exactly 32 bytes (256 bits)"
        );
        assert_eq!(
            *key1, *key2,
            "Key derivation must be deterministic for identical inputs"
        );
        assert_ne!(
            *key1, [0u8; 32],
            "Derived key must not be all zeroes"
        );
    }

    #[test]
    fn test_derive_key_different_salts_produce_different_keys() {
        let password = b"consistent_password";
        let salt1 = [1u8; 16];
        let salt2 = [2u8; 16];

        let key1 = derive_key(password, &salt1).expect("Key derivation 1 failed");
        let key2 = derive_key(password, &salt2).expect("Key derivation 2 failed");

        assert_ne!(
            *key1, *key2,
            "Different salts must produce completely distinct keys"
        );
    }

    #[test]
    fn test_derive_key_different_passwords_produce_different_keys() {
        let salt = [7u8; 16];
        let password_a = b"password_alpha";
        let password_b = b"password_beta";

        let key_a = derive_key(password_a, &salt).expect("Key derivation A failed");
        let key_b = derive_key(password_b, &salt).expect("Key derivation B failed");

        assert_ne!(
            *key_a, *key_b,
            "Different passwords must produce completely distinct keys"
        );
    }
}

