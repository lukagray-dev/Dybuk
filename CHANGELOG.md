# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning.

## [0.0.1-beta] - 2026-08-28

This is the initial pre-release of **Dybuk**, a minimal, distraction-free markdown editor and military-grade secure encrypted vault system built on **Tauri v2** and **Rust**.

### Added
- **Cryptographic Core & `.dybuk` Vault Engine (`dybuk`)**:
  - **Authenticated Encryption**: Integrated AES-256-GCM symmetric encryption with 128-bit authentication tags to protect confidential documents and immediately reject tampered files.
  - **Memory-Hard Key Derivation**: Implemented Argon2id password hashing to defeat GPU and ASIC brute-force cracking attempts.
  - **Binary Container Format (`.dybuk`)**:
    - Custom compact binary layout: `[Magic: "DYBK"][Version: 0x01][Salt: 16B][Nonce: 12B][Ciphertext + Auth Tag]`.
    - 100% self-contained portable files that retain encryption when emailed, shared, or backed up to cloud storage.
  - **RAM Security & Zeroization**: Integrated [`zeroize`](https://crates.io/crates/zeroize) across all plaintext buffers, keys, and intermediate byte slices to erase sensitive cryptographic material on drop.
  - **Accelerated Session Store**: Built an in-memory session cache ([`SessionStore`](file:///d:/Dybuk/dybuk/src/session.rs)) allowing opened vaults to re-open and hot-reload in sub-milliseconds without repeating Argon2id computations.
- **WYSIWYG Markdown Editor & Canvas (`desktop`)**:
  - **Distraction-Free Canvas**: Clean, notepad-like writing area with automatic DOM compilation from raw markdown via Rust's `pulldown-cmark`.
  - **Semantic GFM Serializer**: High-fidelity DOM-to-Markdown serializer preserving headings, lists, code blocks, blockquotes, tables, and tasklists on save.
  - **Two-Line Floating Formatting Toolbar**:
    - Contextual text-selection toolbar providing rapid formatting: Headings (H1, H2, H3), Paragraph, Bold, Italic, Strikethrough, Inline Code, Links, Blockquotes, Code Blocks, and Task Lists.
  - **KaTeX Mathematical Typesetting**: Full rendering support for inline math (`$...$`) and block display math (`$$...$$`).
  - **Keyboard Shortcuts**: Comprehensive shortcuts for Save (<kbd>Ctrl+S</kbd>), Lock Vault (<kbd>Ctrl+L</kbd>), Open File (<kbd>Ctrl+O</kbd>), New Document (<kbd>Ctrl+N</kbd>), Toggle Sidebar (<kbd>Ctrl+B</kbd>), and inline styling.
- **Real-Time Active Document File Watcher**:
  - Cross-platform filesystem watcher using [`notify`](https://crates.io/crates/notify) tracking the single actively opened document.
  - Automatic hot-reloading of external disk modifications made from VS Code, Notepad, or external scripts.
  - Automatic memory re-decryption for `.dybuk` vaults using cached session keys.
  - Anti-loop suppression filtering out Dybuk's own internal saves to avoid feedback loops.
  - Conflict protection: preserves local typing and notifies user when external changes occur on dirty documents.
- **Desktop Application & User Experience (`Tauri v2`)**:
  - Frameless custom dark-mode titlebar with smooth dragging, maximize/restore toggling, minimize, and close actions.
  - State-aware File Menu with submenus for creating Markdown or Encrypted Vault files, saving dirty documents, opening native file pickers, and locking open vaults.
  - Collapsible, resizable left sidebar with recent document history, dynamic search filtering, category pills, and document management.
  - Dynamic empty state with quick document creation cards.
  - High-resolution platinum metallic logo and multi-platform icon assets.
- **CI/CD & Quality Assurance**:
  - Comprehensive Rust test suite with **53 unit tests and 10 doc-tests** covering crypto roundtrips, key derivation, header bounds validation, and storage.
  - GitHub Actions CI workflow ([`ci.yml`](file:///d:/Dybuk/.github/workflows/ci.yml)) testing and linting on push/PR.
  - Automated Pre-Release workflow ([`pre-release.yml`](file:///d:/Dybuk/.github/workflows/pre-release.yml)) auto-computing beta tags and publishing packaged Windows binaries.
  - Manual Stable Release workflow ([`stable-release.yml`](file:///d:/Dybuk/.github/workflows/stable-release.yml)).
  - GitHub Issue and Pull Request templates adhering to strict industrial architecture standards.

