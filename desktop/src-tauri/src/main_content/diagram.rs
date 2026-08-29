//! # Diagram IPC Subsystem
//!
//! Exposes Tauri commands for native compilation of Mermaid diagrams to vector SVG.

use dybuk::diagram::render_mermaid_to_svg;

/// Compiles a Mermaid diagram code string into an SVG string.
///
/// # Arguments
/// * `code` - The raw Mermaid DSL code.
///
/// # Returns
/// * `Ok(String)` - Clean vector SVG markup.
/// * `Err(String)` - Descriptive error message if syntax is invalid.
#[tauri::command]
pub fn render_mermaid_svg(code: String) -> Result<String, String> {
    render_mermaid_to_svg(&code).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_mermaid_svg_ipc_success() {
        let code = "flowchart LR\n  A --> B".to_string();
        let res = render_mermaid_svg(code);
        assert!(res.is_ok());
        assert!(res.unwrap().contains("<svg"));
    }

    #[test]
    fn test_render_mermaid_svg_ipc_empty_error() {
        let code = "".to_string();
        let res = render_mermaid_svg(code);
        assert!(res.is_err());
    }
}

