# Changelog

All notable changes to this extension will be documented in this file.

## [Unreleased]

### Added
- Added `mouseSelectionCopy` (default `true`): when `mouseScroll` is enabled, mouse drag selection is emulated inside the sticky viewport and copied to the clipboard on release.

### Changed
- Set the default interaction model to full-screen mouse scrolling: `alternateScreen: true`, `mouseScroll: true`, and `mouseSelectionCopy: true`.

## [0.2.0] - 2026-06-15

### Added
- Layered configuration loading: settings now merge from extension `config.json`, the global and project `settings.json` files (under a `stickyInput` key), an optional project `.pi/pi-sticky-input.json`, and `PI_STICKY_INPUT_*` environment overrides, with project sources and environment variables taking precedence. This lets a project configure the extension through its `.pi/settings.json`.
- `overlayScroll` option (default `true`): keeps the bounded history viewport scrollable while an interactive overlay (such as a question dialog) is open by compositing the overlay over the sticky pane. Mouse wheel, `PageUp`/`PageDown`, and `Ctrl+Home`/`Ctrl+End` scroll the background; arrow keys, `Tab`, `Enter`, `Space`, and plain `Home`/`End` still reach the dialog.

### Changed
- Visible overlays now keep the sticky renderer active when `overlayScroll` is enabled and the host pi-tui exposes overlay compositing, instead of always handing off to Pi's original renderer. Falls back to the previous behavior when `overlayScroll` is disabled or compositing is unavailable.
- Widened peer dependency ranges to include Pi `0.79.x`.

### Fixed
- Added bottom scroll padding while a bottom-anchored overlay is taller than the sticky pane, so the end of the conversation can be scrolled above the overlay.

## [0.1.1] - 2026-06-01

### Changed
- Deferred submodule loading and runtime state initialization until first use to reduce startup work.
- Widened peer dependency ranges to `^0.74.0 || ^0.75.0 || ^0.77.0 || ^0.78.0`.

## [0.1.0] - 2026-05-27

### Added
- Added sticky split-footer rendering that keeps Pi status, widgets, editor, and footer anchored below a bounded history viewport.
- Added alternate-screen support, optional alternate-scroll and mouse-wheel history scrolling, and keyboard history scrolling controls.
- Added extension-local configuration loading, validation warnings, and file-only debug logging under `debug/` when enabled.
