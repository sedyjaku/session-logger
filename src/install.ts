import { readFileSync, writeFileSync, copyFileSync, renameSync, existsSync, mkdirSync, unlinkSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { homedir } from "os";
import { CLAUDE_SETTINGS_PATH, ORIGINAL_STATUSLINE_PATH, DB_DIR } from "./config.js";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK_START_CMD = `npx tsx ${PROJECT_ROOT}/src/hooks/session-start.ts`;
const HOOK_END_CMD = `npx tsx ${PROJECT_ROOT}/src/hooks/session-end.ts`;
const STATUSLINE_CMD = `npx tsx ${PROJECT_ROOT}/src/statusline.ts`;
const SKILL_SOURCE = join(PROJECT_ROOT, "skills", "session-tag", "skill.md");
const SKILL_TARGET_DIR = join(homedir(), ".claude", "skills", "session-tag");
const SKILL_TARGET = join(SKILL_TARGET_DIR, "skill.md");

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

export function installHooks(): { startCmd: string; endCmd: string; statusLineCmd: string } {
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

  const existing = settings.statusLine as { type?: string; command?: string } | undefined;
  const alreadyInstalled = existing?.command?.includes(STATUSLINE_CMD);

  if (!alreadyInstalled) {
    if (existing?.command) {
      mkdirSync(DB_DIR, { recursive: true });
      writeFileSync(ORIGINAL_STATUSLINE_PATH, JSON.stringify(existing));
    }
    settings.statusLine = {
      type: "command",
      command: `${STATUSLINE_CMD} ${existing?.command ? `--original ${JSON.stringify(existing.command)}` : ""}`.trim(),
    };
  }

  writeSettings(settings);

  mkdirSync(SKILL_TARGET_DIR, { recursive: true });
  copyFileSync(SKILL_SOURCE, SKILL_TARGET);

  return { startCmd: HOOK_START_CMD, endCmd: HOOK_END_CMD, statusLineCmd: STATUSLINE_CMD };
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

  const currentLine = settings.statusLine as { command?: string } | undefined;
  if (currentLine?.command?.includes(STATUSLINE_CMD)) {
    if (existsSync(ORIGINAL_STATUSLINE_PATH)) {
      const original = JSON.parse(readFileSync(ORIGINAL_STATUSLINE_PATH, "utf-8"));
      settings.statusLine = original;
      unlinkSync(ORIGINAL_STATUSLINE_PATH);
    } else {
      delete settings.statusLine;
    }
  }

  writeSettings(settings);

  if (existsSync(SKILL_TARGET_DIR)) {
    rmSync(SKILL_TARGET_DIR, { recursive: true });
  }
}
