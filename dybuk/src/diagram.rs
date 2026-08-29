//! # Native Mermaid Diagram Compilation Engine
//!
//! This module provides high-performance, deterministic compilation of Mermaid
//! diagram syntax (flowcharts, sequence diagrams, class diagrams, state machines,
//! mindmaps, etc.) directly into clean, scalable vector SVG strings.
//!
//! In Dybuk's WYSIWYG architecture, diagrams are rendered as interactive SVG cards
//! inside the canvas without exposing raw code blocks during normal reading and writing.

use thiserror::Error;

/// Error types that can occur during Mermaid diagram rendering.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum DiagramError {
    /// The input diagram string was empty or contained only whitespace.
    #[error("Diagram code cannot be empty")]
    EmptyInput,

    /// Syntax error or unsupported diagram structure in the Mermaid code.
    #[error("Failed to compile Mermaid diagram: {0}")]
    CompileError(String),
}

/// Compiles a raw Mermaid diagram string into a native SVG vector string.
///
/// # Arguments
/// * `code` - The raw Mermaid diagram source string (e.g. `flowchart TD\n  A --> B`).
///
/// # Returns
/// * `Ok(String)` - Clean vector SVG markup ready for HTML embedding.
/// * `Err(DiagramError)` - Detailed compile error or validation message.
///
/// # Example
/// ```rust
/// use dybuk::diagram::render_mermaid_to_svg;
///
/// let code = "flowchart LR\n  Start --> Finish";
/// let svg_result = render_mermaid_to_svg(code);
/// assert!(svg_result.is_ok());
/// ```
pub fn render_mermaid_to_svg(code: &str) -> Result<String, DiagramError> {
    let clean_code = code.trim();
    if clean_code.is_empty() {
        return Err(DiagramError::EmptyInput);
    }

    match mermaid_rs_renderer::render(clean_code) {
        Ok(svg) => Ok(svg),
        Err(err) => Err(DiagramError::CompileError(err.to_string())),
    }
}

/// Helper function to escape text for safe inclusion inside HTML attributes.
#[must_use]
pub fn escape_html_attr(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Renders a Mermaid diagram into a structured WYSIWYG card container element.
///
/// The card includes the original code stored in `data-mermaid-code` for lossless
/// round-trip serialization back to GitHub-Flavored Markdown.
///
/// # Arguments
/// * `code` - The raw Mermaid diagram code.
///
/// # Returns
/// A complete HTML `<div class="mermaid-diagram-card" ...>` string.
pub fn render_mermaid_card(code: &str) -> String {
    let clean_code = code.trim();
    let escaped_code = escape_html_attr(clean_code);

    match render_mermaid_to_svg(clean_code) {
        Ok(svg) => {
            format!(
                r#"<div class="mermaid-diagram-card" data-mermaid-code="{escaped_code}" contenteditable="false"><div class="mermaid-svg-container">{svg}</div></div>"#
            )
        }
        Err(err) => {
            let escaped_err = escape_html_attr(&err.to_string());
            format!(
                r#"<div class="mermaid-diagram-card error" data-mermaid-code="{escaped_code}" contenteditable="false"><div class="mermaid-error-badge">Diagram Warning</div><div class="mermaid-error-message">{escaped_err}</div></div>"#
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_empty_input_fails() {
        assert_eq!(render_mermaid_to_svg(""), Err(DiagramError::EmptyInput));
        assert_eq!(
            render_mermaid_to_svg("   \n\t  "),
            Err(DiagramError::EmptyInput)
        );
    }

    #[test]
    fn test_render_flowchart_success() {
        let code = r#"
            flowchart TD
                A[User Request] --> B{Is Authenticated?}
                B -->|Yes| C[Open Vault]
                B -->|No| D[Prompt Passphrase]
        "#;
        let result = render_mermaid_to_svg(code);
        assert!(result.is_ok(), "Expected flowchart to compile cleanly");
        let svg = result.unwrap();
        assert!(svg.contains("<svg") && svg.contains("</svg>"));
        assert!(svg.contains("User Request") || svg.contains("Authenticated"));
    }

    #[test]
    fn test_render_sequence_diagram_success() {
        let code = r#"
            sequenceDiagram
                autonumber
                Alice->>John: Hello John, how are you?
                John-->>Alice: Great!
        "#;
        let result = render_mermaid_to_svg(code);
        assert!(result.is_ok(), "Expected sequence diagram to compile");
        let svg = result.unwrap();
        assert!(svg.contains("<svg"));
    }

    #[test]
    fn test_render_mermaid_card_html_structure() {
        let code = "flowchart LR\n  A --> B";
        let card_html = render_mermaid_card(code);
        assert!(card_html.contains(r#"class="mermaid-diagram-card""#));
        assert!(card_html.contains("data-mermaid-code"));
        assert!(card_html.contains(r#"contenteditable="false""#));
        assert!(card_html.contains("<svg"));
    }

    #[test]
    fn test_render_mermaid_card_invalid_fallback() {
        let invalid_code = "this is not valid mermaid syntax at all !!! 12345";
        let card_html = render_mermaid_card(invalid_code);
        assert!(card_html.contains(r#"class="mermaid-diagram-card error""#));
        assert!(card_html.contains("Diagram Warning"));
    }
}

