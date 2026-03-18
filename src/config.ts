import { join } from "path";
import { homedir } from "os";

export const DB_DIR = join(homedir(), ".claude", "session-logger");
export const DB_PATH = join(DB_DIR, "data.db");
export const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
export const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
export const ORIGINAL_STATUSLINE_PATH = join(DB_DIR, "original-statusline.json");

export const MODEL_PRICING: Record<
  string,
  {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  }
> = {
  "claude-opus-4": {
    input: 15,
    output: 75,
    cacheCreation: 18.75,
    cacheRead: 1.5,
  },
  "claude-sonnet-4": {
    input: 3,
    output: 15,
    cacheCreation: 3.75,
    cacheRead: 0.3,
  },
  "claude-haiku-4": {
    input: 0.8,
    output: 4,
    cacheCreation: 1.0,
    cacheRead: 0.08,
  },
};
