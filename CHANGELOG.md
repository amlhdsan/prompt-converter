# Changelog

All notable changes are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

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
