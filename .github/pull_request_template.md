<!-- ============================================================================== -->
<!-- Dybuk - Pull Request Template                                                   -->
<!-- ============================================================================== -->
<!-- Thank you for contributing to Dybuk!                                            -->
<!-- Please make sure you have read CONTRIBUTING.md before submitting your PR.        -->
<!-- NOTE: Pull Requests must target the `dev` branch, NOT `main`.                    -->
<!-- ============================================================================== -->

## Description

<!-- Provide a clear, detailed summary of the changes made and the motivation behind them. -->
<!-- Explain the problem being solved or the feature being introduced. -->

## Related Issue(s)

<!-- Link any related issues using GitHub keywords (e.g. Closes #123, Fixes #456, Relates to #789). -->

- Closes #

## Type of Change

<!-- Please check all options that apply to this change: -->

- [ ] **Bug fix** (non-breaking change which fixes an issue)
- [ ] **New feature** (non-breaking change which adds functionality)
- [ ] **Breaking change** (fix or feature that causes existing APIs, configs, or file formats to change)
- [ ] **Refactoring / Cleanup** (code structure improvement without behavioral changes)
- [ ] **Documentation update** (updating guides, docstrings, or architecture diagrams)
- [ ] **Performance optimization** (improving speed, memory footprint, or bundle size)
- [ ] **Build / CI / Tooling** (updating scripts, workflows, or dependencies)

## Subsystem & Components Affected

<!-- Select the components touched by this PR: -->

- [ ] `desktop/src/` (TypeScript WYSIWYG Canvas, Toolbar & Frontend Styles)
- [ ] `desktop/src-tauri/` (Tauri v2 Desktop Runner & Native Commands)
- [ ] `dybuk/` (Core Cryptography, Argon2id, AES-256-GCM, Vault Format & Storage)
- [ ] `assets/` / `.github/` / Build Tooling

## Security & Cryptographic Review

<!-- If this PR touches encryption, session storage, key derivation, or file reading/writing: -->
<!-- 1. Are plaintext strings wrapped in Zeroizing or cleared from RAM? -->
<!-- 2. Does format parsing prevent buffer overruns or unhandled panics? -->
<!-- 3. Is the .dybuk header structure and version byte preserved? -->

- [ ] This change does not alter security-sensitive or cryptographic logic.
- [ ] **OR** This change touches cryptographic/security logic, and I have documented the security considerations below:
  <!-- Document security and cryptographic considerations here if applicable -->

## UI & Design Standards (Frontend PRs)

<!-- If this PR modifies user interfaces, please verify the following: -->

- [ ] **No Emojis in UI**: Used professional-grade vector SVGs, PNGs, or drawables instead of emojis.
- [ ] **No Placeholders**: No broken links, dummy text, or incomplete screens.
- [ ] **Consistent Styling**: Complies with Dybuk's dark-mode typography, color tokens, and design system.
- [ ] **Visual Proof**: Attached screenshots or a screen recording / GIF demonstrating the UI changes.

<!-- If applicable, paste screenshots / GIFs below: -->

## Code Quality & Testing Checklist

<!-- Please ensure all of the following checks are complete before requesting a review: -->

- [ ] **Target Branch**: This PR targets the `dev` branch (not `main`).
- [ ] **Tests Pass**: `cargo test --workspace` passes without errors or unhandled panics.
- [ ] **Frontend Builds**: `npm run build` succeeds cleanly in `desktop/`.
- [ ] **Linter Clean**: `cargo clippy --workspace -- -D warnings` reports zero warnings.
- [ ] **Inline Comments**: Complex logic and architectural choices are thoroughly commented (explaining the *why*, as if explaining to a new teammate).
- [ ] **Semantic Commits**: Commits follow the semantic format (e.g., `feat(ui): ...`, `fix(crypto): ...`, `docs: ...`).
- [ ] **Documentation**: Updated relevant documentation in `README.md` or code docs if APIs or behaviors changed.

