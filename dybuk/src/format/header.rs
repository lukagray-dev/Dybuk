//! # Vault Header Module
//!
//! Handles encoding and parsing of the 5-byte file header for `.dybuk` files.
//!
//! # Header Layout
//! ```text
//! +------------------+---------------+
//! |  Magic (4 bytes) | Version (1 B) |
//! |     "DYBK"       |     0x01      |
//! +------------------+---------------+
//! ```

use crate::format::error::FormatError;

/// Magic identifier bytes present at the very beginning of all `.dybuk` files.
pub(crate) const MAGIC: &[u8; 4] = b"DYBK";

/// Current `.dybuk` binary vault format version.
pub(crate) const VERSION: u8 = 1;

/// Total size in bytes of the fixed header (4 bytes magic + 1 byte version).
pub(crate) const HEADER_SIZE: usize = 5;

/// Writes the standard 5-byte `.dybuk` header (magic bytes + format version) to the output buffer.
///
/// # Arguments
/// * `buf` - The mutable vector to which the 5 header bytes will be appended.
pub(crate) fn write_header(buf: &mut Vec<u8>) {
    // Step 1: Append the 4-byte magic signature "DYBK".
    buf.extend_from_slice(MAGIC);

    // Step 2: Append the 1-byte version number (0x01).
    buf.push(VERSION);
}

/// Validates the first 5 bytes of a buffer against the expected magic signature and format version.
///
/// # Panic Safety
/// This function never panics on arbitrary slices. If the slice has fewer than 5 bytes,
/// it gracefully returns [`FormatError::TruncatedData`].
///
/// # Arguments
/// * `data` - A byte slice containing at least the first 5 bytes of a `.dybuk` file.
///
/// # Errors
/// * Returns [`FormatError::TruncatedData`] if `data.len() < 5`.
/// * Returns [`FormatError::InvalidMagicBytes`] if the first 4 bytes do not equal `b"DYBK"`.
/// * Returns [`FormatError::UnsupportedVersion`] if the version byte is not supported.
pub(crate) fn parse_header(data: &[u8]) -> Result<(), FormatError> {
    // Step 1: Ensure we have at least 5 bytes to inspect.
    if data.len() < HEADER_SIZE {
        return Err(FormatError::TruncatedData {
            expected_at_least: HEADER_SIZE,
            found: data.len(),
        });
    }

    // Step 2: Verify the 4-byte magic signature using safe slice extraction.
    if &data[0..4] != MAGIC {
        return Err(FormatError::InvalidMagicBytes);
    }

    // Step 3: Verify the format version byte.
    let version = data[4];
    if version != VERSION {
        return Err(FormatError::UnsupportedVersion { found: version });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_header_appends_correct_5_bytes() {
        let mut buf = Vec::new();
        write_header(&mut buf);

        assert_eq!(buf.len(), 5);
        assert_eq!(&buf[0..4], b"DYBK");
        assert_eq!(buf[4], 1);
    }

    #[test]
    fn test_parse_valid_header_succeeds() {
        let valid_data = [b'D', b'Y', b'B', b'K', 1, 0xAA, 0xBB];
        let result = parse_header(&valid_data);
        assert!(result.is_ok(), "Valid header should parse successfully");
    }

    #[test]
    fn test_parse_header_truncated_input() {
        // Less than 5 bytes should return TruncatedData.
        for len in 0..5 {
            let short_data = vec![b'A'; len];
            let result = parse_header(&short_data);
            assert!(result.is_err());
            match result.unwrap_err() {
                FormatError::TruncatedData {
                    expected_at_least,
                    found,
                } => {
                    assert_eq!(expected_at_least, 5);
                    assert_eq!(found, len);
                }
                other => panic!("Expected TruncatedData, got {:?}", other),
            }
        }
    }

    #[test]
    fn test_parse_header_invalid_magic() {
        let invalid_magic = [b'N', b'O', b'P', b'E', 1];
        let result = parse_header(&invalid_magic);
        assert!(result.is_err());
        match result.unwrap_err() {
            FormatError::InvalidMagicBytes => (),
            other => panic!("Expected InvalidMagicBytes, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_header_unsupported_version() {
        let wrong_version = [b'D', b'Y', b'B', b'K', 99];
        let result = parse_header(&wrong_version);
        assert!(result.is_err());
        match result.unwrap_err() {
            FormatError::UnsupportedVersion { found } => {
                assert_eq!(found, 99);
            }
            other => panic!("Expected UnsupportedVersion, got {:?}", other),
        }
    }
}

