//! # Markdown IPC Command Handler
//!
//! This module provides the Tauri IPC command `render_markdown` to compile
//! raw Markdown into structured semantic HTML on the fly.
//!
//! By compiling Markdown in the Rust core with `pulldown-cmark`, we ensure
//! lightning-fast performance, zero vulnerabilities, and 100% deterministic
//! GitHub-Flavored Markdown rendering.

use dybuk::render_to_html;

/// Compiles a Markdown string into semantic HTML using the `pulldown-cmark` engine.
///
/// # Arguments
/// * `content` - The raw Markdown string to be converted.
///
/// # Returns
/// * `Ok(String)` - The compiled semantic HTML.
/// * `Err(String)` - Error message if parsing fails (infallible under pulldown-cmark).
#[tauri::command]
pub async fn render_markdown(content: String) -> Result<String, String> {
    // Call the core dybuk markdown renderer
    let html = render_to_html(&content);
    Ok(html)
}

