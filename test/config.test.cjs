const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createJiti } = require("jiti");

const jiti = createJiti(path.join(__dirname, "config.test.cjs"), { interopDefault: true });
const config = jiti("../src/config/config.ts");

const NON_EXISTENT = path.join(os.tmpdir(), "pi-sticky-input-does-not-exist", "config.json");

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sticky-input-cfg-"));
  const agentDir = path.join(root, "agent");
  const cwd = path.join(root, "project");
  const projectPiDir = path.join(cwd, ".pi");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(projectPiDir, { recursive: true });

  const configPath = path.join(root, "extension-config.json");
  const globalSettingsPath = path.join(agentDir, "settings.json");
  const projectFilePath = path.join(projectPiDir, "pi-sticky-input.json");
  const projectSettingsPath = path.join(projectPiDir, "settings.json");

  const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value), "utf-8");

  return {
    root,
    agentDir,
    cwd,
    configPath,
    writeExtensionConfig: (value) => writeJson(configPath, value),
    writeGlobalSettings: (value) => writeJson(globalSettingsPath, value),
    writeProjectFile: (value) => writeJson(projectFilePath, value),
    writeProjectSettings: (value) => writeJson(projectSettingsPath, value),
    writeRaw: (file, value) => fs.writeFileSync(file, value, "utf-8"),
    globalSettingsPath,
    projectSettingsPath,
    load: (overrides = {}) =>
      config.loadStickyInputConfig({ configPath, agentDir, cwd, env: {}, ...overrides }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test("missing sources resolve to bounded defaults without warnings", () => {
  const result = config.loadStickyInputConfig({
    configPath: NON_EXISTENT,
    agentDir: path.dirname(NON_EXISTENT),
    cwd: path.dirname(NON_EXISTENT),
    env: {},
  });
  assert.deepEqual(result.config, config.DEFAULT_STICKY_INPUT_CONFIG);
  assert.deepEqual(result.warnings, []);
});

test("overlayScroll defaults to true", () => {
  assert.equal(config.DEFAULT_STICKY_INPUT_CONFIG.overlayScroll, true);
});

test("extension config.json is read as a flat object", () => {
  const ws = makeWorkspace();
  try {
    ws.writeExtensionConfig({ enabled: false, mouseScroll: true, keyboardScrollRows: 25 });
    const { config: resolved, warnings } = ws.load();
    assert.equal(resolved.enabled, false);
    assert.equal(resolved.mouseScroll, true);
    assert.equal(resolved.keyboardScrollRows, 25);
    assert.deepEqual(warnings, []);
  } finally {
    ws.cleanup();
  }
});

test("settings.json contributes config under the stickyInput namespace", () => {
  const ws = makeWorkspace();
  try {
    ws.writeGlobalSettings({ defaultModel: "ignored", stickyInput: { overlayScroll: false } });
    const { config: resolved } = ws.load();
    assert.equal(resolved.overlayScroll, false);
  } finally {
    ws.cleanup();
  }
});

test("higher precedence sources override lower ones field by field", () => {
  const ws = makeWorkspace();
  try {
    ws.writeExtensionConfig({ mouseScroll: false, keyboardScrollRows: 10, minimumHistoryRows: 3 });
    ws.writeGlobalSettings({ stickyInput: { mouseScroll: true, keyboardScrollRows: 11 } });
    ws.writeProjectFile({ keyboardScrollRows: 12, minimumHistoryRows: 5 });
    ws.writeProjectSettings({ stickyInput: { keyboardScrollRows: 13 } });

    const { config: resolved } = ws.load();
    // mouseScroll: extension false -> global settings true (no later source touches it).
    assert.equal(resolved.mouseScroll, true);
    // keyboardScrollRows is overridden at every layer; project settings.json wins.
    assert.equal(resolved.keyboardScrollRows, 13);
    // minimumHistoryRows: only extension (3) and project file (5) set it; project file wins.
    assert.equal(resolved.minimumHistoryRows, 5);
  } finally {
    ws.cleanup();
  }
});

test("PI_STICKY_INPUT_* environment overrides win over every file source", () => {
  const ws = makeWorkspace();
  try {
    ws.writeExtensionConfig({ mouseScroll: true });
    ws.writeProjectSettings({ stickyInput: { mouseScroll: true, keyboardScrollRows: 13 } });

    const { config: resolved } = ws.load({
      env: {
        PI_STICKY_INPUT_MOUSE_SCROLL: "false",
        PI_STICKY_INPUT_KEYBOARD_SCROLL_ROWS: "42",
        PI_STICKY_INPUT_OVERLAY_SCROLL: "off",
      },
    });
    assert.equal(resolved.mouseScroll, false);
    assert.equal(resolved.keyboardScrollRows, 42);
    assert.equal(resolved.overlayScroll, false);
  } finally {
    ws.cleanup();
  }
});

test("invalid values warn and fall through to the next-lower source", () => {
  const ws = makeWorkspace();
  try {
    ws.writeExtensionConfig({ keyboardScrollRows: 9 });
    // Out-of-range integer and wrong-typed boolean in the highest-precedence file source.
    ws.writeProjectSettings({ stickyInput: { keyboardScrollRows: 9999, overlayScroll: "nope" } });

    const { config: resolved, warnings } = ws.load();
    // Invalid project value is dropped; extension config.json value shows through.
    assert.equal(resolved.keyboardScrollRows, 9);
    // Invalid boolean is dropped; default (true) shows through.
    assert.equal(resolved.overlayScroll, true);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((w) => w.includes("keyboardScrollRows")));
    assert.ok(warnings.some((w) => w.includes("overlayScroll")));
  } finally {
    ws.cleanup();
  }
});

test("unparseable JSON in a source is reported and ignored", () => {
  const ws = makeWorkspace();
  try {
    ws.writeExtensionConfig({ mouseScroll: true });
    ws.writeRaw(ws.projectSettingsPath, "{ not valid json");
    const { config: resolved, warnings } = ws.load();
    assert.equal(resolved.mouseScroll, true);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("Failed to read pi-sticky-input config"));
  } finally {
    ws.cleanup();
  }
});

test("invalid PI_STICKY_INPUT_* values warn without changing config", () => {
  const result = config.loadStickyInputConfig({
    configPath: NON_EXISTENT,
    agentDir: path.dirname(NON_EXISTENT),
    env: { PI_STICKY_INPUT_KEYBOARD_SCROLL_ROWS: "banana" },
  });
  assert.equal(result.config.keyboardScrollRows, config.DEFAULT_STICKY_INPUT_CONFIG.keyboardScrollRows);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes("PI_STICKY_INPUT_KEYBOARD_SCROLL_ROWS"));
});
