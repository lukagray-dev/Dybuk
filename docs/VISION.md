# Vision

*Put your thoughts in a box. Just hopefully nothing comes out.*

## What is Dybuk?

Dybuk is a minimal, distraction-free markdown editor for people who don't want to learn markdown. You write like you're using Notepad — headers, bold, lists, code blocks — all handled by simple shortcuts and a clean toolbar. No syntax visible. No clutter on screen.

Underneath, Dybuk stores everything as standard GitHub Flavored Markdown (GFM). When privacy matters, a single action seals any file into the `.dybuk` encrypted format — AES-256-GCM authenticated encryption with an Argon2id-derived key. No cloud. No accounts. No one watching.

## Who Is It For?

Dybuk targets a specific kind of writer:

- **Scriptwriters and drafters** who need a focused canvas, not a feature-laden word processor.
- **Diary and journal writers** who want their personal entries encrypted on disk, unreadable to anyone who finds the file.
- **Note-takers** who want markdown's portability without markdown's learning curve.
- **Privacy-conscious individuals** who refuse to trust cloud-based editors with sensitive text.

The common thread: people who want to write, not to configure. People who want the tool to disappear so they can think about the work.

## Supported File Formats

Dybuk supports exactly two file formats:

| Format | Extension | Purpose |
|:---|:---|:---|
| **Markdown** | `.md` | Standard GFM text. Human-readable, portable, unencrypted. For content that doesn't need protection. |
| **Dybuk Vault** | `.dybuk` | A single GFM document encrypted with AES-256-GCM + Argon2id. For content that must stay private. Requires a password to open. |

There are no other export targets. No PDF. No HTML. No DOCX. If you need those, use a dedicated conversion tool on the `.md` output. Dybuk's job is writing and protecting — not publishing.

## Core Principles

### 1. Zero Syntax

The writer never sees raw markdown. Formatting happens through keyboard shortcuts and a minimal toolbar. The editor renders GFM inline — `**bold**` becomes **bold** the moment you type the shortcut. The underlying markdown is always there (and always portable), but the writer never has to think about it.

### 2. Minimal UI

One editor. One canvas. One focus. The interface hides everything that isn't the text: toolbars fade when you're typing, status indicators stay out of the way, and there's no sidebar, tab bar, or notification system competing for attention. Features exist, but they stay invisible until called upon.

### 3. Encrypted Vault

Any `.md` file can be saved as `.dybuk` with a single action. The file is sealed using AES-256-GCM (authenticated encryption) with a key derived from the user's password via Argon2id. The salt, nonce, and KDF parameters are embedded in the file header, making each `.dybuk` file fully self-contained. There's no key escrow, no recovery mechanism, no backdoor. If you forget the password, the file is gone.

### 4. Local-First

No accounts. No cloud sync. No telemetry. No network requests. Dybuk reads from and writes to the local filesystem. Period. The application does not phone home, does not check for updates automatically, and does not upload anything anywhere. Your files stay on your machine.

### 5. Single Document

Dybuk opens one file at a time. There are no tabs, no split views, no project-wide search. This is a deliberate constraint — a forcing function for focus. Open a file, write, save, close. If you need to manage a folder of files, use your operating system's file manager.

## Non-Goals

These are things Dybuk will **not** pursue. They are not "someday" features — they are architectural boundaries.

- **Real-time collaboration.** Dybuk is a single-user, single-device tool. Adding collaboration would require networking, conflict resolution, and accounts — all of which violate core principles.
- **Cloud storage or sync.** Files live on the local filesystem. If users want sync, they can put their files in a Dropbox/Syncthing folder. Dybuk will not build this.
- **Plugin or extension ecosystem.** A plugin system introduces attack surface, maintenance burden, and configuration complexity. Dybuk ships complete.
- **IDE or development features.** No LSP integration, no terminal, no git integration, no project management. Dybuk is for prose, not code.
- **Rich media embedding.** No inline images, no embedded videos, no audio clips. Markdown image syntax is supported in the source, but Dybuk's focus is text.
- **Multi-document tabs or workspaces.** One file. One window. This is the design.

## Competitive Landscape

Dybuk sits in a space with several established tools. Here's how it differs:

| Editor | Dybuk's Differentiation |
|:---|:---|
| **Typora** | Typora is an excellent WYSIWYG markdown editor, but it's closed-source and commercial. Dybuk is AGPLv3, fully open, and adds encrypted storage as a first-class feature. |
| **iA Writer** | iA Writer is beautifully designed but proprietary, subscription-based on some platforms, and lacks built-in encryption. Dybuk prioritizes privacy over polish. |
| **Obsidian** | Obsidian is a knowledge management system — backlinks, graph views, plugins. Dybuk is the opposite: no knowledge graph, no plugins, no complexity. Just write. |
| **MarkText** | MarkText is the closest open-source peer. Dybuk differentiates by adding AES-256-GCM encryption, using a Rust core for performance and security, and targeting mobile natively (not Electron). |
| **Ghostwriter** | Ghostwriter is Linux/Windows only and lacks encryption. Dybuk targets all major platforms (desktop via Tauri, mobile via native Kotlin/Swift) with a shared Rust core. |

The core differentiator across all competitors: **no other minimal markdown editor offers built-in, zero-knowledge encryption as a first-class feature backed by a single, auditable Rust cryptographic core shared across all platforms.**

## Architecture Summary

Dybuk's technical architecture is designed around a single Rust core library (`dybuk/`) that owns all business logic, cryptography, and file I/O:

- **Desktop**: Tauri v2 wraps the Rust core, providing the native window and a web-based UI (HTML, CSS, JavaScript). The frontend communicates with the core via Tauri's IPC command system.
- **Android**: A native Kotlin application consumes the Rust core via UniFFI-generated bindings, compiled as a shared library (`.so` / `.aar`).
- **iOS**: A native Swift application consumes the Rust core via UniFFI-generated bindings, distributed as an `XCFramework`.

This architecture ensures that the cryptographic implementation is written once, tested once, and audited once — regardless of platform. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical specification.

## Licensing

Dybuk is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**.

The AGPLv3 was chosen deliberately:

- It guarantees that all users have access to the source code of any deployed version, including server-side deployments.
- It prevents proprietary forks from stripping the encryption or adding telemetry without releasing the modified source.
- It aligns with the project's core value: users should be able to verify exactly what the software does with their private data.

See [LICENSE](../LICENSE) for the full license text.
