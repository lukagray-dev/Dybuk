# `.dybuk` File Format Specification

**Version**: 1  
**Status**: Draft  
**Last Updated**: 2026-08-24

This document is the authoritative byte-level specification for the `.dybuk` encrypted file format. Any implementation that reads or writes `.dybuk` files must conform to this specification exactly.

---

## Design Goals

1. **Self-contained.** A `.dybuk` file contains everything needed to decrypt itself (except the password). No external key files, no metadata databases, no companion files.
2. **Tamper-evident.** AES-256-GCM's authentication tag detects any modification to the ciphertext or header. Corrupted or tampered files fail loudly at decryption time.
3. **Forward-compatible.** A version field in the header allows future format revisions without breaking readers of older versions.
4. **No metadata leakage.** The file name, creation date, author, and content length of the original document are not stored in the clear. An attacker who obtains a `.dybuk` file learns nothing about its contents beyond the file size (which reveals an approximate content length, but no more).
5. **One file, one document.** Each `.dybuk` file contains exactly one encrypted GFM markdown document. There is no archive, multi-document, or directory structure.

---

## Format Overview

A `.dybuk` file is a binary file with the following high-level structure:

```
┌──────────────────────────────────────────────┐
│  Magic Bytes (6 bytes)                       │
│  Format Version (2 bytes)                    │
│  KDF Parameter Block (12 bytes)              │
│  Salt (32 bytes)                             │
│  Nonce (12 bytes)                            │
│  Ciphertext (variable length)                │
│  Authentication Tag (16 bytes)               │
└──────────────────────────────────────────────┘
```

Total fixed overhead: **80 bytes** (header) + **16 bytes** (auth tag) = **96 bytes**.

A `.dybuk` file is always at least 96 bytes. A file smaller than 96 bytes is invalid and must be rejected without attempting decryption.

---

## Byte-Level Layout

All multi-byte integers are stored in **big-endian** (network byte order).

| Offset | Size (bytes) | Field | Description |
|:---|:---|:---|:---|
| 0 | 6 | `magic` | File signature: `0x44 0x59 0x42 0x55 0x4B 0x00` (ASCII `DYBUK` + null terminator). Identifies the file as a `.dybuk` vault. |
| 6 | 2 | `version` | Format version as a 16-bit unsigned integer. Current value: `0x0001` (version 1). |
| 8 | 4 | `kdf_memory` | Argon2id memory cost parameter (`m`) in kibibytes (KiB), as a 32-bit unsigned integer. Current value: `0x00004C00` (19456 KiB = 19 MiB). |
| 12 | 4 | `kdf_iterations` | Argon2id time cost parameter (`t`) as a 32-bit unsigned integer. Current value: `0x00000002` (2 iterations). |
| 16 | 4 | `kdf_parallelism` | Argon2id parallelism parameter (`p`) as a 32-bit unsigned integer. Current value: `0x00000001` (1 lane). |
| 20 | 32 | `salt` | Random salt for Argon2id key derivation. Generated from a CSPRNG. Unique per file, unique per save operation. |
| 52 | 12 | `nonce` | Random nonce (initialization vector) for AES-256-GCM. Generated from a CSPRNG. Unique per encryption operation. |
| 64 | variable | `ciphertext` | AES-256-GCM encrypted payload. The plaintext is the UTF-8 encoded GFM content of the document. |
| EOF-16 | 16 | `auth_tag` | AES-256-GCM authentication tag. Appended after the ciphertext by the AEAD construction. |

### Field Constraints

- **`magic`**: Must be exactly `0x44 0x59 0x42 0x55 0x4B 0x00`. Any other value means the file is not a `.dybuk` vault.
- **`version`**: Currently must be `0x0001`. Readers that encounter a higher version must reject the file with an "unsupported version" error rather than attempting to parse it.
- **`kdf_memory`**: Must be `>= 8192` (8 MiB minimum) and `<= 4194304` (4 GiB maximum). Values outside this range indicate a corrupted or malicious header.
- **`kdf_iterations`**: Must be `>= 1` and `<= 65535`. Zero iterations are invalid.
- **`kdf_parallelism`**: Must be `>= 1` and `<= 255`.
- **`salt`**: 32 bytes. No further constraints (any bit pattern is valid).
- **`nonce`**: 12 bytes. No further constraints (any bit pattern is valid).
- **`ciphertext`**: Must be at least 0 bytes (an empty document is valid). There is no maximum size imposed by the format, though implementations may impose practical limits.
- **`auth_tag`**: 16 bytes. Produced by AES-256-GCM during encryption. Verified during decryption.

---

## Encryption Pipeline

### Seal (Encrypt and Save)

```
Input:  plaintext (UTF-8 GFM string), password (UTF-8 string)
Output: .dybuk binary file

1.  Generate `salt` ← 32 random bytes from CSPRNG
2.  Generate `nonce` ← 12 random bytes from CSPRNG
3.  Set KDF parameters:
        m = 19456 KiB
        t = 2
        p = 1
4.  Derive key:
        key ← Argon2id(password, salt, m, t, p, output_length=32)
5.  Build AAD (Additional Authenticated Data):
        aad ← magic ‖ version ‖ kdf_memory ‖ kdf_iterations ‖ kdf_parallelism ‖ salt ‖ nonce
        (This is the entire 64-byte header, ensuring the header cannot be
         modified without invalidating the authentication tag.)
6.  Encrypt:
        ciphertext ‖ auth_tag ← AES-256-GCM.Encrypt(key, nonce, plaintext, aad)
7.  Write to file:
        file ← magic ‖ version ‖ kdf_memory ‖ kdf_iterations ‖ kdf_parallelism ‖ salt ‖ nonce ‖ ciphertext ‖ auth_tag
8.  Zeroize:
        Overwrite key, password bytes, and plaintext buffer in memory
```

### Unseal (Read and Decrypt)

```
Input:  .dybuk binary file, password (UTF-8 string)
Output: plaintext (UTF-8 GFM string)

1.  Read file into buffer
2.  Validate minimum size (>= 96 bytes)
3.  Validate magic bytes (offset 0..6)
4.  Read version (offset 6..8). Reject if version > 1.
5.  Read KDF parameters:
        kdf_memory     ← bytes[8..12]   (big-endian u32)
        kdf_iterations ← bytes[12..16]  (big-endian u32)
        kdf_parallelism← bytes[16..20]  (big-endian u32)
6.  Validate KDF parameter ranges (see Field Constraints above)
7.  Read salt ← bytes[20..52]
8.  Read nonce ← bytes[52..64]
9.  Split remaining data:
        ciphertext_with_tag ← bytes[64..EOF]
        (The AES-256-GCM library handles tag extraction internally.)
10. Reconstruct AAD:
        aad ← bytes[0..64]  (the entire header)
11. Derive key:
        key ← Argon2id(password, salt, kdf_memory, kdf_iterations, kdf_parallelism, output_length=32)
12. Decrypt and verify:
        plaintext ← AES-256-GCM.Decrypt(key, nonce, ciphertext_with_tag, aad)
        If tag verification fails → return DecryptionFailed error
        (Do NOT return partial plaintext. Discard all output.)
13. Validate plaintext is valid UTF-8
14. Zeroize:
        Overwrite key, password bytes in memory
15. Return plaintext as a UTF-8 string
```

---

## Additional Authenticated Data (AAD)

The AAD for every AES-256-GCM operation is the **entire 64-byte file header** (offsets 0 through 63, inclusive). This binds the ciphertext to the specific header fields. An attacker cannot:

- Change the KDF parameters (e.g., reduce memory cost to speed up brute-force) without invalidating the auth tag.
- Swap the salt or nonce without invalidating the auth tag.
- Change the version number without invalidating the auth tag.

The AAD is never encrypted — it is stored in the clear as the file header. Its integrity is protected by the authentication tag.

---

## Versioning Strategy

The `version` field allows future format revisions. The following rules govern version handling:

1. **Readers must reject unknown versions.** If `version > 1`, the reader must return an error indicating that the file was created with a newer version of Dybuk and cannot be opened. It must not attempt to guess the format.
2. **Writers always write the current version.** When encrypting a file, the writer always uses the latest version (`0x0001` currently).
3. **Version changes require a new specification.** Any change to the header layout, the encryption algorithm, the KDF, or the AAD construction requires incrementing the version number and publishing an updated specification in this document.
4. **Old versions remain supported.** When a new version is introduced, readers must continue to support all previous versions. A version 2 reader must still be able to open version 1 files.

### Potential Future Changes (Not Committed)

These are changes that might warrant a version bump in the future. They are listed here for planning purposes only and are not part of the current specification:

- **Chunked encryption** for files larger than a threshold (e.g., 64 MiB), with block indices in the AAD to prevent reordering.
- **Algorithm agility** — a field indicating the AEAD algorithm (e.g., ChaCha20-Poly1305 as an alternative to AES-256-GCM).
- **Compressed plaintext** — applying compression (e.g., zstd) to the GFM content before encryption to reduce file size.
- **Key stretching upgrades** — increasing the default Argon2id parameters as hardware improves.

---

## Failure Modes

Implementations must handle the following failure cases gracefully. In all cases, no partial data is returned to the caller.

| Failure | Detection Point | Behavior |
|:---|:---|:---|
| **File too small** | Before header parsing | Reject with `InvalidFormat`: file is less than 96 bytes and cannot contain a valid header + auth tag. |
| **Bad magic bytes** | Header parsing | Reject with `InvalidFormat`: file is not a `.dybuk` vault. |
| **Unsupported version** | Header parsing | Reject with `InvalidFormat`: version is higher than the reader supports. |
| **Invalid KDF parameters** | Header parsing | Reject with `InvalidFormat`: KDF parameters are outside valid ranges (see Field Constraints). This prevents denial-of-service via absurd memory or iteration values. |
| **Wrong password** | Decryption (tag verification) | Reject with `DecryptionFailed`. The AES-256-GCM auth tag will not verify because the wrong key was derived. The implementation must not distinguish between "wrong password" and "corrupted ciphertext" — both produce the same error. |
| **Corrupted ciphertext** | Decryption (tag verification) | Reject with `DecryptionFailed`. Same as wrong password — the auth tag does not verify. |
| **Tampered header** | Decryption (tag verification) | Reject with `DecryptionFailed`. Because the header is used as AAD, any modification to the header invalidates the auth tag even if the ciphertext is untouched. |
| **Truncated file** | Decryption | Reject with `DecryptionFailed` or `InvalidFormat`. If the file was truncated after the header, the ciphertext + tag will be shorter than expected, and tag verification will fail. |
| **Invalid UTF-8 after decryption** | Post-decryption validation | Reject with `InvalidFormat`. The plaintext is expected to be valid UTF-8 GFM. If it isn't (e.g., binary garbage), the file is corrupted. |

### Security Note on Error Messages

The `DecryptionFailed` error must **never** include details about why decryption failed (e.g., "tag mismatch at byte 47" or "derived key does not match"). This prevents oracle attacks where an attacker iterates on partial feedback. The error message to the user should always be: **"Unable to decrypt. Check your password and try again."**

---

## Reference Implementation Notes

### Nonce Reuse Prevention

AES-256-GCM's security is **catastrophically broken** if the same (key, nonce) pair is used for two different encryption operations. In Dybuk's design, this is prevented by:

1. **Generating a fresh random nonce** (12 bytes from CSPRNG) on every seal operation.
2. **Generating a fresh random salt** (32 bytes from CSPRNG) on every seal operation, which means the derived key is also different even if the password is the same.

Together, the probability of a (key, nonce) collision is negligible (approximately 2^-352 for a single collision across all files ever encrypted by all Dybuk users).

### Password Encoding

Passwords are converted to bytes using UTF-8 encoding before being passed to Argon2id. No normalization (NFC, NFKC) is applied. This means that visually identical Unicode strings that use different codepoints will derive different keys. This is a deliberate simplicity tradeoff — the alternative (Unicode normalization) introduces a dependency and a new failure mode.

### Maximum File Size

The format imposes no theoretical maximum file size. However, AES-256-GCM operates on a single plaintext/ciphertext blob in version 1 of this format, which means the entire file must fit in memory during encryption and decryption. Practical limits are determined by available system memory.

If large file support becomes necessary, a future version of the format should introduce chunked encryption with block indices in the AAD (see Versioning Strategy).
