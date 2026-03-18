import { execFileSync } from "child_process";
import { getDb, closeDb } from "./db.js";
import type { Label } from "./types.js";

interface StatusLineInput {
  session_id?: string;
  model?: { display_name?: string };
  context_window?: { used_percentage?: number };
  cost?: { total_cost_usd?: number; total_duration_ms?: number };
}

function getLabels(sessionId: string): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT l.name FROM labels l
       JOIN session_labels sl ON l.id = sl.label_id
       WHERE sl.session_id = ?`
    )
    .all(sessionId) as Label[];
  return rows.map((r) => r.name);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function parseOriginalCmd(): string | null {
  const idx = process.argv.indexOf("--original");
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function runOriginalCmd(cmd: string, stdinData: string): string {
  try {
    return execFileSync("/bin/bash", ["-c", cmd], { input: stdinData, encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

function buildDefaultStatus(input: StatusLineInput): string {
  const parts: string[] = [];

  if (input.model?.display_name) {
    parts.push(input.model.display_name);
  }

  if (input.context_window?.used_percentage != null) {
    parts.push(`ctx: ${Math.round(input.context_window.used_percentage)}%`);
  }

  if (input.cost?.total_cost_usd != null) {
    parts.push(`$${input.cost.total_cost_usd.toFixed(2)}`);
  }

  if (input.cost?.total_duration_ms != null) {
    parts.push(formatDuration(input.cost.total_duration_ms));
  }

  return parts.join(" | ");
}

function main(): void {
  try {
    let raw = "";
    const stdin = process.stdin;
    stdin.setEncoding("utf-8");

    stdin.on("data", (chunk: string) => {
      raw += chunk;
    });

    stdin.on("end", () => {
      try {
        const input = JSON.parse(raw) as StatusLineInput;
        const parts: string[] = [];

        const originalCmd = parseOriginalCmd();
        if (originalCmd) {
          const originalOutput = runOriginalCmd(originalCmd, raw);
          if (originalOutput) parts.push(originalOutput);
        } else {
          const defaultStatus = buildDefaultStatus(input);
          if (defaultStatus) parts.push(defaultStatus);
        }

        if (input.session_id) {
          const labels = getLabels(input.session_id);
          if (labels.length > 0) {
            parts.push(`[${labels.join(", ")}]`);
          } else {
            parts.push(`\x1b[31m! Session not labeled !\x1b[0m`);
          }
        }

        if (parts.length > 0) {
          process.stdout.write(parts.join(" | "));
        }
      } catch {
      } finally {
        try {
          closeDb();
        } catch {
        }
        process.exit(0);
      }
    });
  } catch {
    process.exit(0);
  }
}

main();
