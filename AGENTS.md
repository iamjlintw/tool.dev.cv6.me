# Repository Guidelines

## Project Structure & Module Organization
- Root-level HTML utilities: `index.html` links to `json_formatter.html`, `qrcode_generator.html`, `random_generator.html`, `passwd.html`, `md.html`, `mermaid.html`, and the two `liuyao` tools. No nested folders or build artifacts—ship plain HTML/CSS/JS.
- Shared JavaScript lives in standalone files (for example `passwordGenerator.js`). Keep new scripts next to their page and avoid cross-page globals unless absolutely needed.
- External libraries (Bootstrap, jQuery, Mermaid) are loaded via CDNs in each page. Pin versions in the `<head>` when adding or upgrading to keep behavior stable.

## Build, Test, and Development Commands
- Static site—no build step. Open files directly in a browser or serve locally to avoid file URL quirks.
- Quick local server from the repo root: `python -m http.server 8080` then visit `http://localhost:8080/index.html`.

## Coding Style & Naming Conventions
- HTML: 4-space indentation; keep layout Bootstrap-friendly and prefer semantic tags (`section`, `button`, `label`).
- JavaScript: use `camelCase` for functions/variables (e.g., `generatePassword`, `evaluateStrength`), keep logic in small page-scoped functions, and avoid leaking globals across tools.
- Filenames: follow current pattern—lowercase with underscores for HTML (`json_formatter.html`) and lowerCamelCase for JS (`passwordGenerator.js`).
- UI copy uses Traditional Chinese; stay consistent when adding text or labels.

## Testing Guidelines
- No automated suite; rely on manual verification: load the page, exercise main actions, and check the console for errors.
- Validate happy-path and invalid inputs (e.g., password length bounds 1–64, random output variability, markdown/mermaid rendering).
- Confirm responsiveness on mobile and desktop widths when layout changes touch Bootstrap components.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subjects (e.g., `Add mermaid file loader`, `Fix password strength colors`) and group related changes together.
- Pull requests: short summary, screenshots or GIFs for UI updates, and steps to verify locally. Link issues when available and note any new CDN dependencies or version bumps.

## Security & Configuration Tips
- Do not embed secrets or tokens; everything runs client-side and is publicly visible.
- Prefer HTTPS CDN links, pin versions, and ship minimal in-repo fallbacks only when a page cannot function without the resource.
