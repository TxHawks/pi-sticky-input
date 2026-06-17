import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_FILE_NAME = "config.json";
const PROJECT_CONFIG_FILE_NAME = "pi-sticky-input.json";
const SETTINGS_FILE_NAME = "settings.json";
const SETTINGS_NAMESPACE = "stickyInput";
const CONFIG_DIR_NAME = ".pi";
const AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
const ENV_PREFIX = "PI_STICKY_INPUT_";
const EXTENSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface StickyInputConfig {
  debug: boolean;
  enabled: boolean;
  splitFooterRenderer: boolean;
  alternateScreen: boolean;
  alternateScroll: boolean;
  mouseScroll: boolean;
  mouseSelectionCopy: boolean;
  mouseWheelScrollRows: number;
  keyboardScroll: boolean;
  keyboardScrollRows: number;
  minimumHistoryRows: number;
  historyViewportLineLimit: number;
  overlayScroll: boolean;
}

export interface StickyInputConfigLoadResult {
  config: StickyInputConfig;
  warnings: string[];
}

export interface LoadStickyInputConfigOptions {
  /** Extension-local config file. Defaults to `<extensionRoot>/config.json`. */
  configPath?: string;
  /** Project root used to resolve `<cwd>/.pi/*` config sources. */
  cwd?: string;
  /** Pi agent directory used to resolve the global `settings.json`. Defaults to `~/.pi/agent`. */
  agentDir?: string;
  /** Environment used for `PI_STICKY_INPUT_*` overrides. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

export const DEFAULT_STICKY_INPUT_CONFIG: StickyInputConfig = {
  debug: false,
  enabled: true,
  splitFooterRenderer: true,
  alternateScreen: true,
  alternateScroll: false,
  mouseScroll: true,
  mouseSelectionCopy: true,
  mouseWheelScrollRows: 3,
  keyboardScroll: true,
  keyboardScrollRows: 10,
  minimumHistoryRows: 3,
  historyViewportLineLimit: 200,
  overlayScroll: true,
};

const BOOLEAN_FIELDS = [
  "debug",
  "enabled",
  "splitFooterRenderer",
  "alternateScreen",
  "alternateScroll",
  "mouseScroll",
  "mouseSelectionCopy",
  "keyboardScroll",
  "overlayScroll",
] as const satisfies readonly (keyof StickyInputConfig)[];

const BOUNDED_INTEGER_FIELDS = {
  mouseWheelScrollRows: { min: 1, max: 50 },
  keyboardScrollRows: { min: 1, max: 200 },
  minimumHistoryRows: { min: 1, max: 20 },
  historyViewportLineLimit: { min: 20, max: 5000 },
} as const satisfies Record<string, { min: number; max: number }>;

export function getExtensionRoot(): string {
  return EXTENSION_ROOT;
}

export function getConfigPath(): string {
  return join(getExtensionRoot(), CONFIG_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function expandTildePath(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function getDefaultAgentDir(env: Record<string, string | undefined>): string {
  const override = env[AGENT_DIR_ENV]?.trim();
  if (override) {
    return expandTildePath(override);
  }
  return join(homedir(), CONFIG_DIR_NAME, "agent");
}

function toEnvFieldName(field: string): string {
  return field.replace(/([A-Z])/g, "_$1").toUpperCase();
}

function pickBoolean(
  source: Record<string, unknown>,
  field: string,
  sourceLabel: string,
  warnings: string[],
): boolean | undefined {
  const value = source[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    warnings.push(
      `Invalid pi-sticky-input config setting '${field}' in ${sourceLabel}: expected a boolean, got ${formatValue(value)}.`,
    );
    return undefined;
  }

  return value;
}

function pickBoundedInteger(
  source: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
  sourceLabel: string,
  warnings: string[],
): number | undefined {
  const value = source[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    warnings.push(
      `Invalid pi-sticky-input config setting '${field}' in ${sourceLabel}: expected an integer between ${min} and ${max}, got ${formatValue(value)}.`,
    );
    return undefined;
  }

  return value;
}

function parseConfigSource(raw: unknown, sourceLabel: string, warnings: string[]): Partial<StickyInputConfig> {
  if (!isRecord(raw)) {
    warnings.push(`Invalid pi-sticky-input config root in ${sourceLabel}: expected a JSON object. Ignoring this source.`);
    return {};
  }

  const namespaced = raw[SETTINGS_NAMESPACE];
  const source = isRecord(namespaced) ? namespaced : raw;
  const partial: Partial<StickyInputConfig> = {};

  for (const field of BOOLEAN_FIELDS) {
    const value = pickBoolean(source, field, sourceLabel, warnings);
    if (value !== undefined) {
      partial[field] = value;
    }
  }

  for (const field of Object.keys(BOUNDED_INTEGER_FIELDS) as (keyof typeof BOUNDED_INTEGER_FIELDS)[]) {
    const { min, max } = BOUNDED_INTEGER_FIELDS[field];
    const value = pickBoundedInteger(source, field, min, max, sourceLabel, warnings);
    if (value !== undefined) {
      partial[field] = value;
    }
  }

  return partial;
}

function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseEnvConfig(env: Record<string, string | undefined>, warnings: string[]): Partial<StickyInputConfig> {
  const partial: Partial<StickyInputConfig> = {};

  for (const field of BOOLEAN_FIELDS) {
    const envName = `${ENV_PREFIX}${toEnvFieldName(field)}`;
    const rawValue = env[envName];
    if (rawValue === undefined) {
      continue;
    }
    const value = parseEnvBoolean(rawValue);
    if (value === undefined) {
      warnings.push(`Invalid pi-sticky-input config setting '${envName}': expected a boolean, got ${formatValue(rawValue)}.`);
      continue;
    }
    partial[field] = value;
  }

  for (const field of Object.keys(BOUNDED_INTEGER_FIELDS) as (keyof typeof BOUNDED_INTEGER_FIELDS)[]) {
    const envName = `${ENV_PREFIX}${toEnvFieldName(field)}`;
    const rawValue = env[envName];
    if (rawValue === undefined) {
      continue;
    }
    const { min, max } = BOUNDED_INTEGER_FIELDS[field];
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      warnings.push(
        `Invalid pi-sticky-input config setting '${envName}': expected an integer between ${min} and ${max}, got ${formatValue(rawValue)}.`,
      );
      continue;
    }
    partial[field] = parsed;
  }

  return partial;
}

function readJsonFile(path: string, warnings: string[]): unknown {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Failed to read pi-sticky-input config at '${path}': ${message}. Ignoring this source.`);
    return undefined;
  }
}

/**
 * Resolve the effective configuration by layering, lowest precedence first:
 *   1. {@link DEFAULT_STICKY_INPUT_CONFIG}
 *   2. extension-local `config.json`
 *   3. global `~/.pi/agent/settings.json` (`stickyInput` key)
 *   4. project `<cwd>/.pi/pi-sticky-input.json`
 *   5. project `<cwd>/.pi/settings.json` (`stickyInput` key)
 *   6. `PI_STICKY_INPUT_*` environment overrides
 *
 * Each file source may also place its keys under a `stickyInput` object, which is
 * how the shared `settings.json` files namespace this extension's configuration.
 * Invalid values are dropped (with a warning) so a lower-precedence source can show through.
 */
export function loadStickyInputConfig(options: LoadStickyInputConfigOptions = {}): StickyInputConfigLoadResult {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? getConfigPath();
  const agentDir = options.agentDir ?? getDefaultAgentDir(env);
  const { cwd } = options;

  const warnings: string[] = [];

  const fileSources: { path: string; label: string }[] = [
    { path: configPath, label: configPath },
    { path: join(agentDir, SETTINGS_FILE_NAME), label: `${SETTINGS_NAMESPACE} in ${join(agentDir, SETTINGS_FILE_NAME)}` },
  ];

  if (cwd) {
    fileSources.push({
      path: join(cwd, CONFIG_DIR_NAME, PROJECT_CONFIG_FILE_NAME),
      label: join(cwd, CONFIG_DIR_NAME, PROJECT_CONFIG_FILE_NAME),
    });
    fileSources.push({
      path: join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE_NAME),
      label: `${SETTINGS_NAMESPACE} in ${join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE_NAME)}`,
    });
  }

  let config: StickyInputConfig = { ...DEFAULT_STICKY_INPUT_CONFIG };

  for (const { path, label } of fileSources) {
    const raw = readJsonFile(path, warnings);
    if (raw === undefined) {
      continue;
    }
    config = { ...config, ...parseConfigSource(raw, label, warnings) };
  }

  config = { ...config, ...parseEnvConfig(env, warnings) };

  return { config, warnings };
}
