import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { CLAUDE_SETTINGS_PATH } from "./config.js";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK_START_CMD = `npx tsx ${PROJECT_ROOT}/src/hooks/session-start.ts`;
const HOOK_END_CMD = `npx tsx ${PROJECT_ROOT}/src/hooks/session-end.ts`;

function readSettings(): Record<string, unknown> {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) return {};
  const raw = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Failed to parse ${CLAUDE_SETTINGS_PATH}: file contains malformed JSON. Please fix or delete it.`
    );
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  const tmpPath = CLAUDE_SETTINGS_PATH + ".tmp";
  try {
    writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + "\n");
    renameSync(tmpPath, CLAUDE_SETTINGS_PATH);
  } catch (err) {
    throw new Error(
      `Failed to write settings to ${CLAUDE_SETTINGS_PATH}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function hasHook(
  hooks: Record<string, unknown[]>,
  event: string,
  command: string
): boolean {
  const eventHooks = hooks[event] as Array<{ hooks: Array<{ command: string }> }> | undefined;
  if (!eventHooks) return false;
  return eventHooks.some((matcher) =>
    matcher.hooks?.some((h) => h.command === command)
  );
}

export function installHooks(): { startCmd: string; endCmd: string } {
  const settings = readSettings();
  const hooks = (settings.hooks || {}) as Record<string, unknown[]>;

  if (!hasHook(hooks, "SessionStart", HOOK_START_CMD)) {
    if (!hooks.SessionStart) hooks.SessionStart = [];
    (hooks.SessionStart as unknown[]).push({
      hooks: [{ type: "command", command: HOOK_START_CMD }],
    });
  }

  if (!hasHook(hooks, "SessionEnd", HOOK_END_CMD)) {
    if (!hooks.SessionEnd) hooks.SessionEnd = [];
    (hooks.SessionEnd as unknown[]).push({
      hooks: [{ type: "command", command: HOOK_END_CMD }],
    });
  }

  settings.hooks = hooks;
  writeSettings(settings);
  return { startCmd: HOOK_START_CMD, endCmd: HOOK_END_CMD };
}

export function uninstallHooks(): void {
  const settings = readSettings();
  const hooks = (settings.hooks || {}) as Record<string, unknown[]>;

  if (hooks.SessionStart) {
    hooks.SessionStart = (hooks.SessionStart as Array<{ hooks: Array<{ command: string }> }>).filter(
      (matcher) => !matcher.hooks?.some((h) => h.command === HOOK_START_CMD)
    );
    if ((hooks.SessionStart as unknown[]).length === 0) delete hooks.SessionStart;
  }

  if (hooks.SessionEnd) {
    hooks.SessionEnd = (hooks.SessionEnd as Array<{ hooks: Array<{ command: string }> }>).filter(
      (matcher) => !matcher.hooks?.some((h) => h.command === HOOK_END_CMD)
    );
    if ((hooks.SessionEnd as unknown[]).length === 0) delete hooks.SessionEnd;
  }

  settings.hooks = hooks;
  writeSettings(settings);
}
