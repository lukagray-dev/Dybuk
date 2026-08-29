//! # Markdown Compilation Engine
//!
//! This module provides high-performance, deterministic Markdown-to-HTML
//! compilation powered by Rust's `pulldown-cmark` library.
//!
//! In Dybuk's WYSIWYG architecture, when a document (.md or decrypted .dybuk)
//! is loaded, it is compiled into semantic HTML so the user interacts with
//! formatted rich content directly in the canvas without seeing raw Markdown syntax.

use pulldown_cmark::{html, CodeBlockKind, Event, Options, Parser, Tag, TagEnd};

/// Configures and returns standard GitHub-Flavored Markdown (GFM) parsing options.
///
/// We enable:
/// - `ENABLE_TABLES`: Full Markdown table parsing (`| col 1 | col 2 |`).
/// - `ENABLE_FOOTNOTES`: Footnote references and definitions (`[^1]`).
/// - `ENABLE_STRIKETHROUGH`: Tilde strikethrough syntax (`~~deleted~~`).
/// - `ENABLE_TASKLISTS`: GitHub style checkboxes (`- [ ] task`, `- [x] done`).
/// - `ENABLE_SMART_PUNCTUATION`: Typographic curly quotes, dashes (`---`), ellipses (`...`).
/// - `ENABLE_MATH`: Inline (`$math$`) and display (`$$math$$`) LaTeX math formulas.
#[must_use]
pub fn gfm_options() -> Options {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);
    options.insert(Options::ENABLE_MATH);
    options
}

/// Renders a raw Markdown string into clean, structured semantic HTML.
///
/// Native Mermaid diagram blocks (```mermaid ... ```) are compiled directly into
/// vector SVG cards during compilation.
///
/// # Arguments
/// * `markdown` - The raw Markdown text to compile.
///
/// # Returns
/// A `String` containing the rendered HTML.
///
/// # Example
/// ```rust
/// use dybuk::markdown::render_to_html;
///
/// let md = "# Hello Dybuk\n\nThis is **bold** and *italic*.";
/// let html = render_to_html(md);
/// assert!(html.contains("<h1>Hello Dybuk</h1>"));
/// assert!(html.contains("<strong>bold</strong>"));
/// ```
pub fn render_to_html(markdown: &str) -> String {
    // If the input is empty or just whitespace, return an empty string immediately
    if markdown.trim().is_empty() {
        return String::new();
    }

    let options = gfm_options();
    let parser = Parser::new_ext(markdown, options);

    let mut in_mermaid = false;
    let mut mermaid_code = String::new();
    let mut events = Vec::new();

    for event in parser {
        match &event {
            Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(lang)))
                if lang.as_ref() == "mermaid" =>
            {
                in_mermaid = true;
                mermaid_code.clear();
            }
            Event::End(TagEnd::CodeBlock) if in_mermaid => {
                in_mermaid = false;
                let card_html = crate::diagram::render_mermaid_card(&mermaid_code);
                events.push(Event::Html(card_html.into()));
            }
            Event::Text(text) if in_mermaid => {
                mermaid_code.push_str(text);
            }
            _ => {
                if !in_mermaid {
                    events.push(event);
                }
            }
        }
    }

    // Pre-allocate buffer based on input length with reasonable estimate
    let mut html_output = String::with_capacity(markdown.len() * 3 / 2);
    html::push_html(&mut html_output, events.into_iter());

    html_output
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_empty_and_whitespace() {
        assert_eq!(render_to_html(""), "");
        assert_eq!(render_to_html("   \n\t  \n  "), "");
    }

    #[test]
    fn test_render_headings() {
        let input = "# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4\n##### Heading 5\n###### Heading 6";
        let output = render_to_html(input);
        assert!(output.contains("<h1>Heading 1</h1>"));
        assert!(output.contains("<h2>Heading 2</h2>"));
        assert!(output.contains("<h3>Heading 3</h3>"));
        assert!(output.contains("<h4>Heading 4</h4>"));
        assert!(output.contains("<h5>Heading 5</h5>"));
        assert!(output.contains("<h6>Heading 6</h6>"));
    }

    #[test]
    fn test_render_inline_formatting() {
        let input = "Here is **bold**, *italic*, and ~~strikethrough~~, plus `inline code`.";
        let output = render_to_html(input);
        assert!(output.contains("<strong>bold</strong>"));
        assert!(output.contains("<em>italic</em>"));
        assert!(output.contains("<del>strikethrough</del>"));
        assert!(output.contains("<code>inline code</code>"));
    }

    #[test]
    fn test_render_links_and_images() {
        let input = "Check [Dybuk Website](https://dybuk.app) and ![Logo](https://dybuk.app/logo.png).";
        let output = render_to_html(input);
        assert!(output.contains("<a href=\"https://dybuk.app\">Dybuk Website</a>"));
        assert!(output.contains("<img src=\"https://dybuk.app/logo.png\" alt=\"Logo\" />") || output.contains("<img src=\"https://dybuk.app/logo.png\" alt=\"Logo\""));
    }

    #[test]
    fn test_render_lists() {
        let unordered = "- Item Alpha\n- Item Beta\n  - Sub Item";
        let out_un = render_to_html(unordered);
        assert!(out_un.contains("<ul>"));
        assert!(out_un.contains("<li>Item Alpha</li>"));
        assert!(out_un.contains("<li>Item Beta"));

        let ordered = "1. First Step\n2. Second Step\n3. Third Step";
        let out_ord = render_to_html(ordered);
        assert!(out_ord.contains("<ol>"));
        assert!(out_ord.contains("<li>First Step</li>"));
        assert!(out_ord.contains("<li>Second Step</li>"));
    }

    #[test]
    fn test_render_tasklists() {
        let input = "- [ ] Unfinished task\n- [x] Finished task";
        let output = render_to_html(input);
        assert!(output.contains("<input disabled=\"\" type=\"checkbox\"/>") || output.contains("<input type=\"checkbox\"") || output.contains("disabled"));
        assert!(output.contains("Unfinished task"));
        assert!(output.contains("Finished task"));
    }

    #[test]
    fn test_render_blockquotes() {
        let input = "> Simple blockquote\n>> Nested quote";
        let output = render_to_html(input);
        assert!(output.contains("<blockquote>"));
        assert!(output.contains("Simple blockquote"));
        assert!(output.contains("Nested quote"));
    }

    #[test]
    fn test_render_fenced_code_blocks() {
        let input = "```rust\nfn main() {\n    println!(\"Hello\");\n}\n```";
        let output = render_to_html(input);
        assert!(output.contains("<pre><code class=\"language-rust\">"));
        assert!(output.contains("println!(&quot;Hello&quot;);") || output.contains("println!(\"Hello\");"));
    }

    #[test]
    fn test_render_tables() {
        let input = "| Header 1 | Header 2 |\n| :--- | :---: |\n| Cell A | Cell B |";
        let output = render_to_html(input);
        assert!(output.contains("<table>"));
        assert!(output.contains("<thead>"));
        assert!(output.contains("Header 1"));
        assert!(output.contains("Header 2"));
        assert!(output.contains("<tbody>"));
        assert!(output.contains("Cell A"));
        assert!(output.contains("Cell B"));
    }

    #[test]
    fn test_render_horizontal_rule() {
        let input = "Paragraph before\n\n---\n\nParagraph after";
        let output = render_to_html(input);
        assert!(output.contains("<hr />") || output.contains("<hr>"));
    }

    #[test]
    fn test_render_math() {
        let input = "Einstein wrote $E = mc^2$ and Euler gave $$e^{i\\pi} + 1 = 0$$.";
        let output = render_to_html(input);
        // Math is passed through / tagged with math class
        assert!(output.contains("E = mc^2") || output.contains("math"));
    }

    #[test]
    fn test_render_html5_media() {
        let input = r#"<figure align="center"><img src="data:image/png;base64,iVBORw0KGgo=" alt="Sample" width="80%" /><figcaption>Sample Diagram</figcaption></figure>

<video controls src="https://example.com/demo.mp4" width="100%"></video>

<audio controls src="https://example.com/audio.mp3"></audio>"#;
        let output = render_to_html(input);
        assert!(output.contains("<figure"));
        assert!(output.contains("<img"));
        assert!(output.contains("<figcaption>Sample Diagram</figcaption>"));
        assert!(output.contains("<video controls"));
        assert!(output.contains("<audio controls"));
    }

    #[test]
    fn test_render_mermaid_code_blocks() {
        let input = "Here is a process diagram:\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Finish]\n```\n\nDone.";
        let output = render_to_html(input);
        assert!(output.contains("class=\"mermaid-diagram-card\""));
        assert!(output.contains("data-mermaid-code"));
        assert!(output.contains("<svg"));
        assert!(output.contains("Here is a process diagram:"));
        assert!(output.contains("Done."));
    }
}


