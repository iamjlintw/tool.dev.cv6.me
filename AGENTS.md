# Repository Guidelines

## Project Structure & Module Organization
- Root-level HTML utilities: `index.html` links to `json_formatter.html`, `qrcode_generator.html`, `random_generator.html`, `passwd.html`, `md.html`, `mermaid.html`, the two `liuyao` tools, and `xiaoliuren/`. No build artifacts—ship plain HTML/CSS/JS; the only nested tool folder is `xiaoliuren/` (see below for why).
- Shared JavaScript lives in standalone files (for example `passwordGenerator.js`). Keep new scripts next to their page and avoid cross-page globals unless absolutely needed.
- Liuyao chart engine: `ganzhiCalendar.js` (four pillars, solar terms, void branches), `liuyaoCore.js` (palaces, shi/ying, najia, six relatives, six spirits, hidden spirits, month/day relations) and `liuyaoPrompt.js` (LLM reading rules). They are plain scripts exposing `GanzhiCalendar` / `LiuyaoCore` / `LiuyaoPrompt` on the global object, loaded in that order—no ES modules, so pages still open over `file://`. Only `liuyao-divination-yarrow.html` consumes them today; `liuyao-divination.html` still carries its own minimal hexagram-name table. Never re-implement najia logic inside a page.
- Xiaoliuren (小六壬快速問事) lives in its own folder `xiaoliuren/` because its service worker must not take over the rest of the site: `sw.js` is registered with scope `./`, so it only caches `/xiaoliuren/`, and its fetch handler ignores every request outside that path (the parent `analytics.js`, GA, other tools). It is a hash-routed single page (`#/`, `#/result/:id`, `#/history`, `#/validation`, `#/settings`) with no build step. Load order in `index.html`: `xiaoliurenPalaces.js` (six palaces, `polarity` for conflict detection only) → `xiaoliurenCore.js` (`parseInput`, `calculateXiaoLiuRen`, `normalizeQuestionKey`, `isConflicting`; the one and only method is `three-number-sequential`: `nextIndex = (currentIndex + number - 1) % 6`, never add calendar/五行/category logic to it—other schools must be a new `method`) → `xiaoliurenInterpreter.js` (local reading: 144 position texts × 36 tone transitions × special cases) → `xiaoliurenPrompt.js` (AI prompt text only; `AiAdapter` is an empty interface, no provider, no API key) → `xiaoliurenStore.js` (localStorage `xiaoliuren.readings.v1` / `xiaoliuren.settings.v1`, primary/repeated readings, deletion promotion, import preview/commit, stats) → `views/*.js` → `app.js`. Readings are saved automatically on cast. Import merges by id and then normalises relations (earliest reading per `questionKey` becomes primary). Full design and decisions: `docs/xiaoliuren-design.md`. Bump `VERSION` in `sw.js` whenever any file in the folder changes, or installed PWAs keep the old shell.
- Analytics: `analytics.js` holds the single GA4 setup (measurement ID, host allow-list, privacy flags) and is loaded only by `index.html`, `liuyao-divination.html`, `liuyao-divination-yarrow.html`, and `xiaoliuren/index.html` (as `../analytics.js`; its `track()` only sends fixed `xiaoliuren_*` event names with `{ tool: 'xiaoliuren' }`). The other tools stay untracked on purpose—`md.html` and `mermaid.html` advertise themselves as local-only, and `passwd.html` / `json_formatter.html` handle sensitive input. Never pass user content (passwords, pasted JSON/Markdown, divination questions or hexagrams) as event parameters; page views and content-free interaction names only.
- External libraries (Bootstrap, jQuery, Mermaid) are loaded via CDNs in each page. Pin versions in the `<head>` when adding or upgrading to keep behavior stable.
- Tests live in `tests/` and never ship—`scripts/ftp-sync.mjs` excludes the directory.
- Deployment tooling lives in `scripts/ftp-sync.mjs` with the `ftp-sync.sh` wrapper (and `deploy.sh`, which is just `ftp-sync.sh push`); `package.json` and `node_modules/` exist only for that script (`basic-ftp`) and are never served. Credentials stay in an untracked `.env` (see `.env.example`).

## Build, Test, and Development Commands
- Static site—no build step. Open files directly in a browser or serve locally to avoid file URL quirks.
- Quick local server from the repo root: `python -m http.server 8080` then visit `http://localhost:8080/index.html`.

### FTP sync (`./ftp-sync.sh`)
Two-way sync between the repo and the live host. Copy `.env.example` to `.env` first; `npm install` runs automatically on first use.

| Command | Effect |
|---|---|
| `./ftp-sync.sh` | interactive: shows the site and asks push or pull |
| `./ftp-sync.sh push` | local → remote (deploy) |
| `./deploy.sh` | deploy shortcut—thin wrapper for `./ftp-sync.sh push`, forwards every flag |
| `./ftp-sync.sh pull` | remote → local (pick up hand edits made on the server) |
| `... --dry-run` | compare and list differences only, write nothing |
| `... --delete` | also remove files the target has but the source does not (off by default) |
| `... --yes` | skip the interactive confirmation |

- Differences are decided by content: different size means different file, same size triggers a byte-for-byte compare of the remote copy—FTP mtimes are never trusted.
- Only static assets sync (`.html`, `.js`, `.css`, images, fonts…). `*.md`, `.env*`, `.git/`, `.idea/`, `node_modules/`, `scripts/`, `tests/`, `package*.json` and `.DS_Store` are always skipped.
- `pull` overwrites local files, so it lists them and asks before writing; commit first. `npm run sync` / `npm run push` / `npm run pull` call the script directly if you skip the wrapper.
- Console output only ever shows the site (`host:port/remote-dir`) and whether FTPS is on—the FTP account and password are never printed. Running without a direction in a non-TTY (CI, pipes) errors out instead of prompting; pass `push`/`pull` explicitly there.

## Coding Style & Naming Conventions
- HTML: 4-space indentation; keep layout Bootstrap-friendly and prefer semantic tags (`section`, `button`, `label`).
- JavaScript: use `camelCase` for functions/variables (e.g., `generatePassword`, `evaluateStrength`), keep logic in small page-scoped functions, and avoid leaking globals across tools.
- Filenames: follow current pattern—lowercase with underscores for HTML (`json_formatter.html`) and lowerCamelCase for JS (`passwordGenerator.js`).
- UI copy uses Traditional Chinese; stay consistent when adding text or labels.

## Testing Guidelines
- `npm test` runs the only automated suite (Node's built-in runner, no extra dependency) over `tests/*.test.js`: the ganzhi calendar, the liuyao chart engine, a fixed regression case, the yarrow page wiring, and the xiaoliuren core/interpreter/prompt/store (`tests/xiaoliuren*.test.js`, loaded via `tests/_loadXiaoliuren.js`). The nine xiaoliuren regression casts in `tests/xiaoliurenCore.test.js` are permanent: a refactor that changes any of them must fail, never edit the expected values. `tests/_load.js` evaluates the browser scripts through `node:vm` so tests and pages share one implementation; `tests/` is excluded from FTP sync.
- Everything else has no automated coverage; rely on manual verification: load the page, exercise main actions, and check the console for errors.
- Validate happy-path and invalid inputs (e.g., password length bounds 1–64, random output variability, markdown/mermaid rendering).
- Confirm responsiveness on mobile and desktop widths when layout changes touch Bootstrap components.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subjects (e.g., `Add mermaid file loader`, `Fix password strength colors`) and group related changes together.
- Pull requests: short summary, screenshots or GIFs for UI updates, and steps to verify locally. Link issues when available and note any new CDN dependencies or version bumps.

## Security & Configuration Tips
- Do not embed secrets or tokens; everything runs client-side and is publicly visible.
- FTP credentials belong in `.env` only (git-ignored). Keep `FTP_SECURE=true` so the password is not sent in the clear; the sync script never prints it.
- Prefer HTTPS CDN links, pin versions, and ship minimal in-repo fallbacks only when a page cannot function without the resource.
