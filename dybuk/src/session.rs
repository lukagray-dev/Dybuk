//! # Session Key Store Module
//!
//! This module provides an in-memory cache ([`SessionStore`]) for decrypted document
//! encryption keys. When a user enters their passphrase to unlock a `.dybuk` vault,
//! the derived 32-byte key is held here so subsequent reads and saves to that file
//! do not require prompting the user or re-running expensive Argon2id key derivation.
//!
//! # Memory Security
//! Keys stored in this cache are wrapped in [`Zeroizing<[u8; 32]>`]. When an entry is
//! removed (via [`SessionStore::lock`] or [`SessionStore::lock_all`]), the underlying
//! key bytes in RAM are immediately overwritten with zeros.
//!
//! # Concurrency & Thread-Safety Design
//! [`SessionStore`] intentionally does **not** embed internal synchronization primitives
//! such as `std::sync::Mutex` or `std::sync::RwLock`. In the overall Dybuk architecture,
//! multi-thread safety is managed by the application/Tauri layer (e.g. `tauri::State<Mutex<SessionStore>>`).
//! Keeping this struct free of locks ensures high performance, zero lock contention overhead
//! in non-threaded contexts, and seamless unit testability.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use zeroize::Zeroizing;

/// In-memory cache mapping document filesystem paths to their derived 256-bit symmetric keys.
///
/// # Security Note
/// All stored keys are wrapped in [`Zeroizing`] to ensure automatic memory sanitization
/// upon removal or store destruction.
#[derive(Debug, Default)]
pub struct SessionStore {
    /// Internal map associating normalized document paths to their zeroizing encryption keys.
    unlocked: HashMap<PathBuf, Zeroizing<[u8; 32]>>,
}

impl SessionStore {
    /// Creates a new, empty [`SessionStore`].
    ///
    /// # Examples
    /// ```
    /// use dybuk::SessionStore;
    ///
    /// let store = SessionStore::new();
    /// ```
    #[must_use]
    pub fn new() -> Self {
        Self {
            unlocked: HashMap::new(),
        }
    }

    /// Caches the encryption key for a document path, marking the document as unlocked.
    ///
    /// If the path was already unlocked with a previous key, the existing entry is replaced
    /// and the old key is immediately zeroized from memory.
    ///
    /// # Arguments
    /// * `path` - The absolute or canonical filesystem path of the document.
    /// * `key` - The 32-byte derived symmetric key, wrapped in [`Zeroizing`].
    ///
    /// # Examples
    /// ```
    /// use std::path::PathBuf;
    /// use zeroize::Zeroizing;
    /// use dybuk::SessionStore;
    ///
    /// let mut store = SessionStore::new();
    /// let key = Zeroizing::new([0x42u8; 32]);
    /// store.unlock(PathBuf::from("/path/to/notes.dybuk"), key);
    /// ```
    pub fn unlock(&mut self, path: PathBuf, key: Zeroizing<[u8; 32]>) {
        // Step 1: Insert into the HashMap. If a key was already present for this path,
        // HashMap::insert drops the old Zeroizing value, safely zeroing its memory.
        self.unlocked.insert(path, key);
    }

    /// Retrieves a reference to the cached 32-byte symmetric key for the given path.
    ///
    /// # Security
    /// Returns a direct borrowed reference (`&[u8; 32]`) rather than cloning the key out,
    /// preventing duplicate unmanaged copies from proliferating in memory.
    ///
    /// # Arguments
    /// * `path` - The path of the document to look up.
    ///
    /// # Returns
    /// - `Some(&[u8; 32])` if the file is currently unlocked.
    /// - `None` if the file is locked or not present in the cache.
    #[must_use]
    pub fn get_key(&self, path: &Path) -> Option<&[u8; 32]> {
        // Deref through the Zeroizing wrapper to yield a borrowed reference to the inner array.
        self.unlocked.get(path).map(|zeroizing_key| &**zeroizing_key)
    }

    /// Locks a specific document by removing its key from the cache.
    ///
    /// When the entry is removed, the [`Zeroizing`] wrapper is dropped and its
    /// memory is immediately overwritten with zeros.
    ///
    /// # Arguments
    /// * `path` - The path of the document to lock.
    pub fn lock(&mut self, path: &Path) {
        // Step 1: Remove entry from map. Dropping the returned Option<Zeroizing> triggers zeroization.
        self.unlocked.remove(path);
    }

    /// Locks all currently unlocked documents by wiping the entire session cache.
    ///
    /// Useful when the app goes into the background, the screen locks, or the user
    /// requests a global lock.
    pub fn lock_all(&mut self) {
        // Clearing the map drops all Zeroizing entries, wiping all keys from memory.
        self.unlocked.clear();
    }

    /// Returns `true` if the specified document is currently unlocked in this session.
    ///
    /// # Arguments
    /// * `path` - The path of the document to check.
    #[must_use]
    pub fn is_unlocked(&self, path: &Path) -> bool {
        self.unlocked.contains_key(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unlock_and_get_key() {
        let mut store = SessionStore::new();
        let path = PathBuf::from("C:/notes/secure.dybuk");
        let key_bytes = [0xABu8; 32];
        let zeroizing_key = Zeroizing::new(key_bytes);

        // Before unlocking
        assert!(!store.is_unlocked(&path));
        assert_eq!(store.get_key(&path), None);

        // Unlock
        store.unlock(path.clone(), zeroizing_key);

        // After unlocking
        assert!(store.is_unlocked(&path));
        let retrieved = store.get_key(&path).expect("Key should be present");
        assert_eq!(retrieved, &key_bytes);
    }

    #[test]
    fn test_lock_removes_key_and_marks_locked() {
        let mut store = SessionStore::new();
        let path = PathBuf::from("/home/user/diary.dybuk");
        let key = Zeroizing::new([0x77u8; 32]);

        store.unlock(path.clone(), key);
        assert!(store.is_unlocked(&path));

        // Lock the specific file
        store.lock(&path);

        assert!(!store.is_unlocked(&path));
        assert_eq!(store.get_key(&path), None);
    }

    #[test]
    fn test_lock_all_clears_all_entries() {
        let mut store = SessionStore::new();
        let path1 = PathBuf::from("doc1.dybuk");
        let path2 = PathBuf::from("doc2.dybuk");
        let path3 = PathBuf::from("doc3.dybuk");

        store.unlock(path1.clone(), Zeroizing::new([1u8; 32]));
        store.unlock(path2.clone(), Zeroizing::new([2u8; 32]));
        store.unlock(path3.clone(), Zeroizing::new([3u8; 32]));

        assert!(store.is_unlocked(&path1));
        assert!(store.is_unlocked(&path2));
        assert!(store.is_unlocked(&path3));

        // Lock all
        store.lock_all();

        assert!(!store.is_unlocked(&path1));
        assert!(!store.is_unlocked(&path2));
        assert!(!store.is_unlocked(&path3));
        assert_eq!(store.get_key(&path1), None);
        assert_eq!(store.get_key(&path2), None);
        assert_eq!(store.get_key(&path3), None);
    }

    #[test]
    fn test_unlock_same_path_overwrites_gracefully() {
        let mut store = SessionStore::new();
        let path = PathBuf::from("document.dybuk");

        let key1 = Zeroizing::new([0x11u8; 32]);
        let key2 = Zeroizing::new([0x22u8; 32]);

        // Unlock with key 1
        store.unlock(path.clone(), key1);
        assert_eq!(store.get_key(&path), Some(&[0x11u8; 32]));

        // Unlock with key 2 (overwrite)
        store.unlock(path.clone(), key2);
        assert_eq!(store.get_key(&path), Some(&[0x22u8; 32]));
    }
}

