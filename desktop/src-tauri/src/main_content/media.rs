//! # Media Subsystem & IPC Command Handlers
//!
//! This module provides native file dialogs and streaming utilities for inserting
//! media files (images, GIFs, videos, and audio) into Dybuk's WYSIWYG editor canvas.
//!
//! To uphold Dybuk's zero-knowledge cryptographic vault promise (`.dybuk`), media
//! inserted into encrypted documents is embedded as Base64 Data URIs (`data:image/...`).
//! This prevents plaintext media assets from leaking into unencrypted disk directories.

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

/// Maximum allowed media file size for base64 conversion and vault embedding: 50 Megabytes.
/// This prevents memory exhaustion and slowdowns during Argon2id / AES-256-GCM passes.
pub const MAX_MEDIA_FILE_SIZE_BYTES: u64 = 50 * 1024 * 1024; // 50 MB

/// Result payload containing the base64-encoded media Data URI and metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaDataPayload {
    /// Full Base64 Data URI ready for HTML `<img src="...">` or `<video src="...">` (e.g. `data:image/png;base64,...`)
    pub data_url: String,
    /// Detected MIME type (e.g. `image/png`, `video/mp4`)
    pub mime_type: String,
    /// Basename of the file (e.g. `screenshot.png`)
    pub file_name: String,
    /// File size on disk in bytes
    pub size_bytes: u64,
    /// True if the media is a video format (e.g. mp4, webm)
    pub is_video: bool,
    /// True if the media is an audio format (e.g. mp3, wav)
    pub is_audio: bool,
}

/// Helper function to detect MIME type and media category based on file extension.
#[must_use]
pub fn detect_media_info(path: &Path) -> (String, bool, bool) {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        // Standard raster and vector images
        "png" => ("image/png".to_string(), false, false),
        "jpg" | "jpeg" => ("image/jpeg".to_string(), false, false),
        "gif" => ("image/gif".to_string(), false, false),
        "webp" => ("image/webp".to_string(), false, false),
        "svg" => ("image/svg+xml".to_string(), false, false),
        "bmp" => ("image/bmp".to_string(), false, false),
        "ico" => ("image/x-icon".to_string(), false, false),
        "avif" => ("image/avif".to_string(), false, false),

        // Video formats
        "mp4" => ("video/mp4".to_string(), true, false),
        "webm" => ("video/webm".to_string(), true, false),
        "mov" => ("video/quicktime".to_string(), true, false),
        "mkv" => ("video/x-matroska".to_string(), true, false),
        "avi" => ("video/x-msvideo".to_string(), true, false),

        // Audio formats
        "mp3" => ("audio/mpeg".to_string(), false, true),
        "wav" => ("audio/wav".to_string(), false, true),
        "ogg" => ("audio/ogg".to_string(), false, true),
        "m4a" => ("audio/mp4".to_string(), false, true),
        "flac" => ("audio/flac".to_string(), false, true),
        "aac" => ("audio/aac".to_string(), false, true),

        // Fallback for unknown binary streams
        _ => ("application/octet-stream".to_string(), false, false),
    }
}

/// Opens a native system file dialog to pick an image, GIF, video, or audio file.
///
/// Returns the selected absolute file path, or `None` if the user cancelled the dialog.
#[tauri::command]
pub async fn select_media_dialog() -> Result<Option<String>, String> {
    // Open system file picker with targeted media extensions
    let file = rfd::AsyncFileDialog::new()
        .set_title("Insert Media")
        .add_filter(
            "All Supported Media (Images, Videos, Audio)",
            &[
                "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif",
                "mp4", "webm", "mov", "mkv", "avi",
                "mp3", "wav", "ogg", "m4a", "flac", "aac",
            ],
        )
        .add_filter(
            "Images & GIFs (*.png, *.jpg, *.gif, *.webp, *.svg)",
            &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"],
        )
        .add_filter("Videos (*.mp4, *.webm, *.mov)", &["mp4", "webm", "mov", "mkv", "avi"])
        .add_filter("Audio (*.mp3, *.wav, *.ogg)", &["mp3", "wav", "ogg", "m4a", "flac", "aac"])
        .add_filter("All Files", &["*"])
        .pick_file()
        .await;

    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}

/// Reads a local media file from disk, enforces the 50 MB safety threshold, and returns
/// a base64 Data URI suitable for direct insertion in HTML without needing extra webview server setup.
#[tauri::command]
pub async fn read_media_file_base64(path: String) -> Result<MediaDataPayload, String> {
    let file_path = Path::new(&path);

    // 1. Verify file exists
    if !file_path.exists() || !file_path.is_file() {
        return Err(format!("Media file does not exist or is not a regular file: {}", path));
    }

    // 2. Check file size against 50 MB threshold
    let metadata = file_path
        .metadata()
        .map_err(|e| format!("Failed to read media file metadata: {}", e))?;

    let size_bytes = metadata.len();
    if size_bytes > MAX_MEDIA_FILE_SIZE_BYTES {
        return Err(format!(
            "Media file is too large ({:.2} MB). The maximum allowed size is 50 MB.",
            size_bytes as f64 / (1024.0 * 1024.0)
        ));
    }

    // 3. Detect MIME type and properties
    let (mime_type, is_video, is_audio) = detect_media_info(file_path);
    let file_name = file_path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("media")
        .to_string();

    // 4. Read file bytes into memory buffer
    let mut file = File::open(file_path)
        .map_err(|e| format!("Failed to open media file: {}", e))?;
    let mut buffer = Vec::with_capacity(size_bytes as usize);
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read media file content: {}", e))?;

    // 5. Encode to Base64 Data URI
    let base64_str = BASE64_STANDARD.encode(&buffer);
    let data_url = format!("data:{};base64,{}", mime_type, base64_str);

    Ok(MediaDataPayload {
        data_url,
        mime_type,
        file_name,
        size_bytes,
        is_video,
        is_audio,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn test_detect_media_info_images() {
        let (mime, is_v, is_a) = detect_media_info(Path::new("photo.png"));
        assert_eq!(mime, "image/png");
        assert!(!is_v);
        assert!(!is_a);

        let (mime, is_v, is_a) = detect_media_info(Path::new("photo.jpg"));
        assert_eq!(mime, "image/jpeg");
        assert!(!is_v);
        assert!(!is_a);

        let (mime, is_v, is_a) = detect_media_info(Path::new("animation.gif"));
        assert_eq!(mime, "image/gif");
        assert!(!is_v);
        assert!(!is_a);
    }

    #[test]
    fn test_detect_media_info_videos_and_audio() {
        let (mime, is_v, is_a) = detect_media_info(Path::new("movie.mp4"));
        assert_eq!(mime, "video/mp4");
        assert!(is_v);
        assert!(!is_a);

        let (mime, is_v, is_a) = detect_media_info(Path::new("song.mp3"));
        assert_eq!(mime, "audio/mpeg");
        assert!(!is_v);
        assert!(is_a);
    }

    #[test]
    fn test_read_media_file_base64_success() {
        let temp_path = std::env::temp_dir().join("dybuk_test_image.png");
        let test_bytes = b"\x89PNG\r\n\x1a\nFake PNG content";
        let mut file = fs::File::create(&temp_path).unwrap();
        file.write_all(test_bytes).unwrap();
        drop(file);

        let path_str = temp_path.to_string_lossy().to_string();
        let rt = tauri::async_runtime::block_on(async {
            read_media_file_base64(path_str).await
        }).unwrap();

        assert!(rt.data_url.starts_with("data:image/png;base64,"));
        assert_eq!(rt.size_bytes, test_bytes.len() as u64);

        let _ = fs::remove_file(&temp_path);
    }
}

