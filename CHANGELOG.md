# Changelog

All notable changes are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

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
