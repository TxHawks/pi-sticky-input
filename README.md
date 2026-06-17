# pi-sticky-input

`pi-sticky-input` is a Pi extension that keeps chat input, status widgets, editor content, and footer controls anchored while session history updates in a bounded viewport above them.

- **GitHub**: <https://github.com/TxHawks/pi-sticky-input>

## Capabilities

- Keeps Pi's status, below-editor widgets, editor, and footer together in a sticky pane.
- Bounds rendered history above the sticky pane so long sessions do not push input off screen.
- Uses an alternate screen by default for a full-screen sticky layout.
- Supports keyboard history scrolling with `PageUp`, `PageDown`, `Ctrl+PageUp`, `Ctrl+PageDown`, `Ctrl+Home`, and `Ctrl+End`.
- Supports terminal mouse-wheel scrolling through SGR mouse capture by default, with emulated drag-to-copy selection while mouse capture is enabled.
- Keeps history scrollable while an interactive overlay (such as a question dialog) is open, compositing the overlay on top of the sticky pane (`overlayScroll`).
- Falls back to Pi's original renderer for structurally unknown layouts (and for overlays when `overlayScroll` is off or the host pi-tui lacks overlay compositing).
- Keeps debug logging disabled by default and writes only to the extension-local `debug/` directory when enabled.

## Installation

### Global installation

```bash
pi install git:github.com/TxHawks/pi-sticky-input
```

### Local installation

```bash
pi install -l git:github.com/TxHawks/pi-sticky-input
```

## Usage

The sticky renderer is enabled automatically when the extension loads and the TUI is available.

The `/sticky-input` command controls optional mouse-wheel capture at runtime:

```text
/sticky-input status
/sticky-input mouse on
/sticky-input mouse off
/sticky-input mouse toggle
/sticky-input help
```

Keyboard history scrolling, mouse-wheel capture, and alternate-screen mode are enabled by default.

Because mouse capture is enabled by default, native terminal selection/link clicks are captured by the app. With `mouseSelectionCopy: true` (default), pi-sticky-input emulates drag selection inside the rendered viewport, copies selected text to the clipboard on mouse release, and briefly shows a themed top-right `Text copied` overlay. Run `/sticky-input off` to restore native terminal mouse behavior for the current session.

## Configuration

Configuration is resolved by layering several sources. Later sources override earlier ones, field by field:

| Order | Source                                               | Notes                                                                     |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| 1     | Built-in defaults                                    | See the table below.                                                      |
| 2     | `~/.pi/agent/extensions/pi-sticky-input/config.json` | Extension-local runtime config (a flat object).                           |
| 3     | `~/.pi/agent/settings.json` → `stickyInput`          | Global Pi settings; this extension reads the nested `stickyInput` object. |
| 4     | `<project>/.pi/pi-sticky-input.json`                 | Per-project config file (a flat object).                                  |
| 5     | `<project>/.pi/settings.json` → `stickyInput`        | Per-project Pi settings; reads the nested `stickyInput` object.           |
| 6     | `PI_STICKY_INPUT_*` environment variables            | Highest precedence.                                                       |

Invalid values from any source are reported as a startup warning and dropped, so a lower-precedence source (or the default) shows through instead.

Each file source may also place its keys under a `stickyInput` object — this is how `settings.json` namespaces the extension's options:

```jsonc
// ~/.pi/agent/settings.json or <project>/.pi/settings.json
{
  "theme": "kanagawa-dragon",
  "stickyInput": {
    "mouseScroll": true,
    "overlayScroll": true,
  },
}
```

A starter template for the extension-local `config.json` is included at `config/config.example.json`:

```bash
cp config/config.example.json config.json
```

Environment overrides use the `PI_STICKY_INPUT_` prefix with the upper-snake-case option name, e.g. `PI_STICKY_INPUT_MOUSE_SCROLL=true` or `PI_STICKY_INPUT_OVERLAY_SCROLL=false`.

The published package intentionally excludes local runtime state: `config.json` and `debug/` stay local to each installation.

### Configuration options

| Key                        | Type      | Default | Purpose                                                                                                                                                                    |
| -------------------------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`                    | `boolean` | `false` | Enables file-only diagnostics under `debug/debug.log`                                                                                                                      |
| `enabled`                  | `boolean` | `true`  | Enables the extension                                                                                                                                                      |
| `splitFooterRenderer`      | `boolean` | `true`  | Enables the sticky split-footer renderer patch                                                                                                                             |
| `alternateScreen`          | `boolean` | `true`  | Uses an alternate terminal screen while the session is active for a full-screen app-style layout                                                                            |
| `alternateScroll`          | `boolean` | `false` | Lets compatible terminals translate wheel input into alternate-screen cursor sequences                                                                                     |
| `mouseScroll`              | `boolean` | `true`  | Enables SGR mouse-wheel capture for terminals without alternate-scroll support                                                                                             |
| `mouseSelectionCopy`       | `boolean` | `true`  | When `mouseScroll` is enabled, emulates drag selection and copies selected text to the clipboard on release                                                                |
| `mouseWheelScrollRows`     | `number`  | `3`     | Rows scrolled per wheel event                                                                                                                                              |
| `keyboardScroll`           | `boolean` | `true`  | Enables page-key and home/end history scrolling                                                                                                                            |
| `keyboardScrollRows`       | `number`  | `10`    | Rows scrolled per keyboard page event                                                                                                                                      |
| `minimumHistoryRows`       | `number`  | `3`     | Minimum history viewport height before falling back on very small terminals                                                                                                |
| `historyViewportLineLimit` | `number`  | `200`   | Maximum retained renderer-managed history lines before choosing the visible slice                                                                                          |
| `overlayScroll`            | `boolean` | `true`  | Keeps history scrollable while an overlay/modal is open by compositing the overlay over the sticky pane; falls back to Pi's original renderer when disabled or unsupported |

### Example config

```json
{
  "debug": false,
  "enabled": true,
  "splitFooterRenderer": true,
  "alternateScreen": true,
  "alternateScroll": false,
  "mouseScroll": true,
  "mouseSelectionCopy": true,
  "mouseWheelScrollRows": 3,
  "keyboardScroll": true,
  "keyboardScrollRows": 10,
  "minimumHistoryRows": 3,
  "historyViewportLineLimit": 200,
  "overlayScroll": true
}
```

Invalid or missing values are normalized to bounded defaults when the extension loads configuration.

### Scrolling while a question dialog is open

With `overlayScroll` enabled (the default), the history viewport stays scrollable while an interactive overlay such as a question dialog is awaiting input. Only inputs that do not collide with the dialog's own keys are intercepted:

- mouse wheel (requires `mouseScroll`, or alternate-scroll, to be enabled), and
- `PageUp` / `PageDown` and `Ctrl+Home` / `Ctrl+End`.

Arrow keys, `Tab`, `Enter`, `Space`, and plain `Home` / `End` continue to flow through to the dialog. If the running pi-tui build does not expose overlay compositing, the extension transparently falls back to Pi's original renderer while the overlay is visible.

## Compatibility

- `powerline-footer`: compatible by default because `pi-sticky-input` keeps status, widgets, editor, and footer inside the sticky pane instead of replacing singleton editor/footer hooks.
- `pi-agent-router`: compatible because below-editor widgets remain inside the sticky pane viewport.
- `pi-startup-redraw-fix`: compatible because `pi-sticky-input` patches the live `TUI.doRender` path and uses terminal clear ordering that does not require startup-redraw-fix's full-clear rewrite.
- Overlays composite on top of the sticky pane while `overlayScroll` is enabled (the default), keeping history scrollable; with `overlayScroll` off, or on hosts without overlay compositing, overlays fall back to Pi's original renderer. Structurally unknown layouts always fall back for safety.

## Debug logging

Debug logging is disabled by default through `"debug": false`. When enabled, logs are appended only to:

```text
debug/debug.log
```

The extension does not write debug output to `console`, `stdout`, or `stderr`, and no debug log file is opened when debug logging is disabled.

## Development

```bash
npm run typecheck
npm run test
npm run build
npm run package:dry-run
```

## License

MIT © MasuRii
