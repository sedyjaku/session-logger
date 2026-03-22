import { readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { getDb } from "../db.js";
import { CLAUDE_PROJECTS_DIR } from "../config.js";
import { parseTranscript, getPrimaryModel, sumTokens } from "./transcript.service.js";
import { calculateCost } from "./cost.service.js";
import { upsertModelBreakdownForDoctor, upsertAnalyticsForDoctor } from "./session.service.js";
import type { Session } from "../types.js";

interface DoctorResult {
  discovered: number;
  synced: number;
  created: number;
  errors: string[];
}

function discoverTranscripts(): Array<{
  sessionId: string;
  transcriptPath: string;
  projectPath: string;
}> {
  const results: Array<{
    sessionId: string;
    transcriptPath: string;
    projectPath: string;
  }> = [];

  if (!existsSync(CLAUDE_PROJECTS_DIR)) return results;

  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const projectDir = join(CLAUDE_PROJECTS_DIR, dir.name);
    const files = readdirSync(projectDir);
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const sessionId = file.replace(".jsonl", "");
      results.push({
        sessionId,
        transcriptPath: join(projectDir, file),
        projectPath: "/" + dir.name.slice(1).replace(/-/g, "/"),
      });
    }
  }

  return results;
}

export function runDoctor(): DoctorResult {
  const db = getDb();
  const transcripts = discoverTranscripts();
  const result: DoctorResult = { discovered: 0, synced: 0, created: 0, errors: [] };

  result.discovered = transcripts.length;

  for (const t of transcripts) {
    try {
      const existing = db
        .prepare("SELECT * FROM sessions WHERE session_id = ?")
        .get(t.sessionId) as Session | undefined;

      const tokensByModel = parseTranscript(t.transcriptPath);
      const costBreakdown = calculateCost(tokensByModel);
      const primaryModel = getPrimaryModel(tokensByModel);

      const totals = sumTokens(tokensByModel);

      const stat = statSync(t.transcriptPath);
      const fileModified = stat.mtime.toISOString();

      if (existing) {
        db.prepare(
          `UPDATE sessions SET
            transcript_path = ?,
            model = COALESCE(?, model),
            ended_at = COALESCE(ended_at, ?),
            input_tokens = ?,
            output_tokens = ?,
            cache_creation_tokens = ?,
            cache_read_tokens = ?,
            estimated_cost_usd = ?
           WHERE session_id = ?`
        ).run(
          t.transcriptPath, primaryModel, fileModified,
          totals.input, totals.output, totals.cacheCreation, totals.cacheRead,
          costBreakdown.totalCost, t.sessionId
        );
        result.synced++;
      } else {
        const fileBirth = stat.birthtime.toISOString();
        const durationSeconds = Math.round(
          (stat.mtime.getTime() - stat.birthtime.getTime()) / 1000
        );

        db.prepare(
          `INSERT OR IGNORE INTO sessions
            (session_id, transcript_path, project_path, model, source, started_at, ended_at,
             duration_seconds, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
             estimated_cost_usd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          t.sessionId, t.transcriptPath, t.projectPath, primaryModel,
          "discovered", fileBirth, fileModified, durationSeconds,
          totals.input, totals.output, totals.cacheCreation, totals.cacheRead,
          costBreakdown.totalCost
        );
        result.created++;
      }

      upsertModelBreakdownForDoctor(t.sessionId, costBreakdown);
      upsertAnalyticsForDoctor(t.sessionId, t.transcriptPath);
    } catch (err) {
      result.errors.push(`${t.sessionId}: ${(err as Error).message}`);
    }
  }

  return result;
}
