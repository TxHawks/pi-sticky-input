const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { createJiti } = require("jiti");

const jiti = createJiti(path.join(__dirname, "terminal-session.test.cjs"), { interopDefault: true });
const terminalSession = jiti("../src/tui/terminal-session.ts");
const config = jiti("../src/config/config.ts");

test("default terminal mode uses full-screen mouse scrolling with selection-copy", () => {
  assert.equal(config.DEFAULT_STICKY_INPUT_CONFIG.alternateScreen, true);
  assert.equal(config.DEFAULT_STICKY_INPUT_CONFIG.mouseScroll, true);
  assert.equal(config.DEFAULT_STICKY_INPUT_CONFIG.mouseSelectionCopy, true);
  assert.equal(config.DEFAULT_STICKY_INPUT_CONFIG.alternateScroll, false);
});

test("alternate screen is restored after TUI stop, not before it", () => {
  const events = [];
  const tui = {
    terminal: {
      write(data) {
        events.push(data);
      },
    },
    requestRender(force) {
      events.push(`requestRender:${force}`);
    },
    stop() {
      events.push("original-stop");
    },
  };

  terminalSession.activateStickyTerminalSession(tui, {
    alternateScreen: true,
    alternateScroll: false,
    mouseScroll: true,
    mouseSelectionCopy: true,
  });
  assert.equal(events[0], "\x1b[?1049h\x1b[H\x1b[2J\x1b[?1007l\x1b[?1002h\x1b[?1006h");
  assert.equal(events[0].includes("\x1b[?1007h"), false);
  events.length = 0;

  tui.stop();

  assert.deepEqual(events, ["original-stop", "\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l"]);
});

test("mouse tracking can toggle without leaving alternate screen", () => {
  const events = [];
  const tui = {
    terminal: {
      write(data) {
        events.push(data);
      },
    },
    requestRender(force) {
      events.push(`requestRender:${force}`);
    },
    stop() {},
  };

  terminalSession.activateStickyTerminalSession(tui, {
    alternateScreen: true,
    alternateScroll: false,
    mouseScroll: false,
    mouseSelectionCopy: true,
  });
  events.length = 0;

  terminalSession.activateStickyTerminalSession(tui, {
    alternateScreen: true,
    alternateScroll: false,
    mouseScroll: true,
    mouseSelectionCopy: true,
  });

  assert.equal(events[0], "\x1b[?1002h\x1b[?1006h");
  assert.equal(events[0].includes("\x1b[?1049l"), false);
  assert.equal(events[0].includes("\x1b[?1049h"), false);
  events.length = 0;

  terminalSession.activateStickyTerminalSession(tui, {
    alternateScreen: true,
    alternateScroll: false,
    mouseScroll: false,
    mouseSelectionCopy: true,
  });

  assert.equal(events[0], "\x1b[?1006l\x1b[?1002l\x1b[?1000l");
  assert.equal(events[0].includes("\x1b[?1049l"), false);
});

test("mouse tracking can opt out of selection-copy drag reporting", () => {
  const events = [];
  const tui = {
    terminal: {
      write(data) {
        events.push(data);
      },
    },
    requestRender(force) {
      events.push(`requestRender:${force}`);
    },
    stop() {},
  };

  terminalSession.activateStickyTerminalSession(tui, {
    alternateScreen: false,
    alternateScroll: false,
    mouseScroll: true,
    mouseSelectionCopy: false,
  });

  assert.equal(events[0], "\x1b[?1000h\x1b[?1006h");
  terminalSession.deactivateStickyTerminalSession();
});

test("mouse input actions include wheel and emulated selection gestures", () => {
  assert.deepEqual(terminalSession.getStickyMouseInputAction("\x1b[<64;1;1M", { selectionCopy: true }), {
    type: "wheel",
    direction: "up",
  });
  assert.deepEqual(terminalSession.getStickyMouseInputAction("\x1b[<0;5;6M", { selectionCopy: true }), {
    type: "leftPress",
    row: 5,
    col: 4,
  });
  assert.deepEqual(terminalSession.getStickyMouseInputAction("\x1b[<32;7;8M", { selectionCopy: true }), {
    type: "leftDrag",
    row: 7,
    col: 6,
  });
  assert.deepEqual(terminalSession.getStickyMouseInputAction("\x1b[<0;9;10m", { selectionCopy: true }), {
    type: "release",
    row: 9,
    col: 8,
  });
  assert.deepEqual(terminalSession.getStickyMouseInputAction("\x1b[<0;5;6M", { selectionCopy: false }), {
    type: "mouse",
  });
});

test("arrow key sequences are left for the focused UI instead of sticky history scrolling", () => {
  assert.equal(terminalSession.parseAlternateScrollInput("\x1bOA"), undefined);
  assert.equal(terminalSession.parseAlternateScrollInput("\x1bOB"), undefined);
  assert.equal(terminalSession.parseAlternateScrollInput("\x1b[A"), undefined);
  assert.equal(terminalSession.parseAlternateScrollInput("\x1b[B"), undefined);
  assert.equal(terminalSession.parseAlternateScrollInput("\x1b[A", { allowCursorKeys: true }), undefined);
  assert.equal(terminalSession.getKeyboardScrollRows("\x1b[5;5~", 10), -10);
  assert.equal(terminalSession.getKeyboardScrollRows("\x1b[6;5~", 10), 10);
  assert.equal(terminalSession.getKeyboardScrollRows("\x1b[5;2~", 10), -10);
  assert.equal(terminalSession.getKeyboardScrollRows("\x1b[6;3~", 10), 10);
  assert.equal(terminalSession.getKeyboardScrollRows("\x1b[1;5H", 10), -Number.MAX_SAFE_INTEGER);
  assert.equal(terminalSession.getKeyboardScrollRows("\x1b[1;5F", 10), Number.MAX_SAFE_INTEGER);
  assert.equal(terminalSession.getKeyboardScrollRows("\x1b[H", 10), undefined);
  assert.equal(
    terminalSession.getKeyboardScrollRows("\x1b[H", 10, { allowPlainHomeEnd: true }),
    -Number.MAX_SAFE_INTEGER,
  );
});

test("visible input-capturing overlays can bypass sticky terminal input handling", () => {
  assert.equal(terminalSession.hasVisibleOverlay(undefined), false);
  assert.equal(terminalSession.hasVisibleOverlay({ hasOverlay: () => true }), true);
  assert.equal(terminalSession.hasVisibleOverlay({ overlayStack: [{}] }), true);
  assert.equal(terminalSession.hasVisibleOverlay({ overlayStack: [{ options: { nonCapturing: true } }] }), false);
  assert.equal(terminalSession.hasVisibleOverlay({ overlayStack: [{ hidden: true }] }), false);
  assert.equal(
    terminalSession.hasVisibleOverlay({
      terminal: { columns: 80, rows: 24 },
      overlayStack: [{ options: { visible: () => false } }],
    }),
    false,
  );
  assert.equal(terminalSession.hasVisibleOverlay({ overlayStack: [] }), false);
});

test("overlay scroll claims wheel events and safe page keys but leaves modal keys alone", () => {
  const overlayConfig = {
    mouseScroll: true,
    keyboardScroll: true,
    mouseWheelScrollRows: 3,
    keyboardScrollRows: 10,
  };

  // Mouse wheel scrolls the background history.
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[<64;1;1M", overlayConfig), {
    type: "mouse",
    deltaRows: -3,
  });
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[<65;1;1M", overlayConfig), {
    type: "mouse",
    deltaRows: 3,
  });
  // Non-wheel mouse events are still claimed (so raw bytes never reach the modal) but do not scroll.
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[<0;5;5M", overlayConfig), {
    type: "mouse",
    deltaRows: undefined,
  });
  // Page keys and Ctrl+Home/End scroll the background.
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[5~", overlayConfig), {
    type: "keyboard",
    deltaRows: -10,
  });
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[6~", overlayConfig), {
    type: "keyboard",
    deltaRows: 10,
  });
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[1;5H", overlayConfig), {
    type: "keyboard",
    deltaRows: -Number.MAX_SAFE_INTEGER,
  });
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[1;5F", overlayConfig), {
    type: "keyboard",
    deltaRows: Number.MAX_SAFE_INTEGER,
  });
  // Keys the modal relies on are left untouched.
  assert.equal(terminalSession.getOverlayScrollAction("\x1b[H", overlayConfig), undefined);
  assert.equal(terminalSession.getOverlayScrollAction("\x1b[F", overlayConfig), undefined);
  assert.equal(terminalSession.getOverlayScrollAction("\x1bOA", overlayConfig), undefined);
  assert.equal(terminalSession.getOverlayScrollAction("\x1b[B", overlayConfig), undefined);
  assert.equal(terminalSession.getOverlayScrollAction("\t", overlayConfig), undefined);
  assert.equal(terminalSession.getOverlayScrollAction("a", overlayConfig), undefined);
});

test("overlay scroll respects disabled mouse and keyboard scroll modes", () => {
  const mouseOnly = { mouseScroll: true, keyboardScroll: false, mouseWheelScrollRows: 3, keyboardScrollRows: 10 };
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[<64;1;1M", mouseOnly), { type: "mouse", deltaRows: -3 });
  assert.equal(terminalSession.getOverlayScrollAction("\x1b[5~", mouseOnly), undefined);

  const keyboardOnly = { mouseScroll: false, keyboardScroll: true, mouseWheelScrollRows: 3, keyboardScrollRows: 10 };
  assert.equal(terminalSession.getOverlayScrollAction("\x1b[<64;1;1M", keyboardOnly), undefined);
  assert.deepEqual(terminalSession.getOverlayScrollAction("\x1b[5~", keyboardOnly), { type: "keyboard", deltaRows: -10 });
});

test("non-editor focused components bypass sticky terminal input handling", () => {
  const editorFocus = {
    constructor: { name: "CustomEditor" },
    getText() {},
    setText() {},
    handleInput() {},
    onSubmit: undefined,
  };
  const selectorFocus = {
    constructor: { name: "ExtensionSelectorComponent" },
    handleInput() {},
  };

  assert.equal(terminalSession.shouldHandleStickyTerminalInput({ focusedComponent: editorFocus }), true);
  assert.equal(terminalSession.shouldHandleStickyTerminalInput({ focusedComponent: selectorFocus }), false);
  assert.equal(terminalSession.shouldHandleStickyTerminalInput({ hasOverlay: () => true, focusedComponent: editorFocus }), false);
});
