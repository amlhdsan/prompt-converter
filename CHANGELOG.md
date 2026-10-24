# Changelog

All notable changes are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

## [1.4.0] - 2026-10-24

### Added
- **Command palette** (`Ctrl/⌘+K`): fuzzy search over every action, dialog and mode.
- **Batch convert** (`Ctrl/⌘+Shift+B`): one prompt per line or `---`-separated blocks, 2 at a time, saved to history, copy all / export Markdown.
- **Placeholder fill**: a form for `[请补充 …]` / `[TODO …]` placeholders in the result; blanks are kept.
- **Built-in mode instruction editor** with per-mode reset (Templates → Built-in mode instructions).
- **Connection test** in Settings (non-streaming ping with latency).
- **History export as Markdown**.
- **Japanese UI** (zh → en → ja cycle); i18n completeness is enforced by unit tests.
- **Unit tests** (Vitest, 67 tests) for SSE parsing, provider request/response formats, retries, stalls, aborts, storage migrations, corruption/quota recovery, import/export validation, diff, quality score, tokens, share encoding, Markdown safety, placeholders, batch runner, i18n parity.
- **CI workflow** on push/PR: ESLint, TypeScript, unit, Playwright e2e, build, `cargo check`; README badge.

### Changed / Stability
- Network: automatic retry with exponential backoff + jitter for 429/5xx/network/timeout (only before any output, honours `Retry-After`, configurable 0–3, default 2); last retry falls back to non-streaming; streams that stall keep the partial text and show a notice; in-flight requests are aborted on page hide; robust incremental SSE parser (CRLF/CR, split chunks, multi-line data, `event: error`, non-JSON keep-alives); proxies that answer SSE to non-stream requests are handled.
- Storage: versioned schema (v2) with ordered migrations, sanitisation of every record, corrupted JSON is backed up to `pc.corrupt.*` and reset (banner shown), quota errors evict old non-favourite history and finally fall back to memory (banner shown), multi-tab sync, import rejects backups from newer schemas.
- Global error boundary: render errors show a recovery screen (reload / reset UI state / copy log); window errors and unhandled rejections are logged to an optional local error log (Settings → View error log).
- TypeScript stricter (`noUnused*`, `noImplicitReturns`, …) and ESLint (flat config).
- E2E: 117 checks; server start-up is polled instead of a fixed sleep (fixed a cold-start flake); verified 6 consecutive green runs.
- Desktop: poison-tolerant locks, no `unwrap`/`expect` on startup paths, panic hook writes `panic.log` to the app log dir, `panic = "unwind"` so a worker-thread panic can't kill the app, window position/size saved 600 ms after move/resize, atomic backup writes, a banner when the saved global hotkey can't be registered (`hotkey_status` command + `hotkey-failed` event).

### Not included
- **In-app auto-updater**: Tauri's updater requires a signing key pair whose private key must be stored as the `TAURI_SIGNING_PRIVATE_KEY` repository secret. The token used for this release cannot write repository secrets, so the updater was skipped; the existing GitHub-release update notice remains.

## [1.3.0] - 2026-10-24

### Added
- **Providers**: Anthropic Claude (native Messages API), Google Gemini, Kimi (Moonshot), Zhipu GLM, SiliconFlow, OpenRouter, Ollama and LM Studio (local, no key); key optional for custom endpoints; **fetch model list** from `/models`.
- **Profiles**: save provider + base URL + model + key combos and switch in one click.
- **Variants** (1–3 per conversion, tabbed) and **iterative refine** (one-click chips or any follow-up instruction, keeps context).
- **Quality score**: instant local assessment of original vs converted prompt with concrete suggestions.
- **Test run**: send the converted prompt to the model and preview the answer (streaming, Markdown).
- **Markdown rendering** with raw toggle; word-level **diff view** (CJK aware).
- **Export .md / .txt** and **share links** encoded in the URL hash (deflate + base64url, no server).
- **Token & cost estimate**; **example library** (13 examples, zh/en).
- **PWA**: web app manifest, offline service worker, installable on desktop and mobile.
- Desktop: **auto-paste** back into the previous app, **window size/position memory**, quieter launch-at-login.
- New shortcuts: `Ctrl/⌘+Shift+R` test run, `Ctrl/⌘+Shift+E` examples.

### Changed
- `main.ts` split into `lib/` (pure logic) and `ui/` (state, dom, actions, output, quick window, dialogs) modules.
- Errors: distinct messages for rate limits (429, with Retry-After), 5xx, configurable idle **timeouts**, plus clean abort.
- Accessibility: dialog focus trap and focus restore, roving arrow-key focus in mode tabs, skip link, ARIA labels/live regions, keyboard-operable history items, WCAG AA text contrast, visible focus rings.
- Responsive layout for phones (single column, scrollable mode bar, bottom-sheet dialogs).
- Settings: optional **session-only API keys**, configurable timeout, quality-score toggle.

### Security
- Strict Content-Security-Policy (`script-src 'self'`), `no-referrer`, safe Markdown renderer (escape-first, http(s)/mailto links only), nginx security headers in the Docker image, backups exclude keys by default.

## [1.2.1] - 2026-10-24

### Added
- Cross-platform desktop installers built by GitHub Actions (`.github/workflows/tauri-release.yml`): Windows (`.msi` / `-setup.exe`), macOS (`.dmg` for Apple Silicon and Intel), Linux (`.AppImage` / `.deb` / `.rpm`).

## [1.2.0] - 2026-10-24

### Added
- **Custom templates**: create, edit and delete your own conversion modes (name, icon, instructions); stored locally and shown as extra modes.
- **Import / export** of settings, templates and history as JSON (API keys optional), merged by id on import.
- **History search and favorites**; favorites are never evicted or cleared; per-entry delete; history cap raised to 100.
- **Output language**: Traditional Chinese, Japanese, Korean, French, German, Spanish, Russian, plus any custom language.
- **Keyboard shortcuts** (`Ctrl/⌘+Enter` anywhere, copy, settings, history, templates, `Alt+1…9`, `Esc`) and a shortcuts help dialog (`?`).
- **Desktop app (Tauri v2)** for Windows / macOS / Linux: global hotkey (default `Ctrl/⌘+Shift+Space`, configurable) toggling an always-on-top quick-convert window with clipboard read/write; tray icon (show, quick convert, launch at login, quit); native HTTP (no CORS limits); update check opens the Releases page.
- Release workflow template `docs/tauri-release.yml` (tauri-action matrix, triggered by `v*` tags).
- E2E tests for all of the above (46 checks).

### Changed
- Data is local-only for both web and desktop; privacy text updated.

## [1.1.0] - 2026-10-23

### Added
- Version number shown in the footer and Settings (injected at build time).
- In-app update check against GitHub releases (falls back to latest commit on `main`), at most once per 24h, silent when offline; can be disabled; manual "Check for updates" in Settings.
- `npm run update` one-command updater (git pull + npm install + build).
- README "更新 / Updating" section; this CHANGELOG.

### Changed
- Apple-inspired UI redesign: frosted app bar, large headline, segmented controls, sheet-style settings/history, refined dark mode, reduced-motion support.

## [1.0.0] - 2026-10-23

### Added
- Initial release: rewrite rough prompts into structured prompts via any OpenAI-compatible API (DeepSeek, OpenAI, Qwen/DashScope, custom), streaming, five modes, output language, compare view, copy, history, zh/en UI, light/dark theme, Docker self-hosting.
