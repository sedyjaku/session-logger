import { Command } from "commander";
import chalk from "chalk";
import {
  listSessions,
  getSession,
  getMostRecentSession,
  syncSession,
  getAllSessions,
  getModelBreakdown,
  getMessageOutliers,
  getCrossSessionOutliers,
} from "./services/session.service.js";
import {
  addLabel,
  removeLabel,
  listAllLabels,
  getSummary,
  getSummaryByModel,
  getLabelsForSession,
} from "./services/label.service.js";
import { runDoctor } from "./services/doctor.service.js";
import {
  formatSessionList,
  formatSessionDetail,
  formatLabelList,
  formatSummary,
  formatMessageOutliers,
  formatModelSummary,
} from "./format.js";
import { installHooks, uninstallHooks } from "./install.js";
import { closeDb } from "./db.js";

function withErrorHandling(fn: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    try {
      fn(...args);
    } catch (err) {
      process.stderr.write(chalk.red((err as Error).message) + "\n");
      closeDb();
      process.exit(1);
    }
  };
}

const program = new Command();

program
  .name("session-log")
  .description("Track and audit Claude Code sessions with labels and cost analysis")
  .version("1.0.0");

program
  .command("list")
  .description("List sessions with metrics")
  .option("-l, --label <label>", "Filter by label")
  .option("-d, --days <days>", "Filter by last N days", parseInt)
  .option("-n, --limit <limit>", "Max results", parseInt, 20)
  .action(withErrorHandling((opts: unknown) => {
    const options = opts as { label?: string; days?: number; limit?: number };
    const sessions = listSessions({
      label: options.label,
      days: options.days,
      limit: options.limit,
    });
    const labels: Record<string, string[]> = {};
    for (const s of sessions) {
      labels[s.session_id] = getLabelsForSession(s.session_id).map((l) => l.name);
    }
    console.log(formatSessionList(sessions, labels));
    closeDb();
  }));

program
  .command("show <session-id>")
  .description("Show detailed session view")
  .option("-m, --messages [limit]", "Show costliest messages", parseInt)
  .action(withErrorHandling((sessionId: unknown, opts: unknown) => {
    const options = opts as { messages?: number | true };
    const session = getSession(sessionId as string);
    if (!session) {
      console.log(chalk.red(`Session not found: ${sessionId}`));
      process.exit(1);
    }
    const labels = getLabelsForSession(session.session_id).map((l) => l.name);
    const models = getModelBreakdown(session.session_id);
    console.log(formatSessionDetail(session, labels, models));
    if (options.messages !== undefined) {
      const limit = typeof options.messages === "number" ? options.messages : 10;
      const outliers = getMessageOutliers(session.session_id, limit);
      console.log("");
      console.log(formatMessageOutliers(outliers, false));
    }
    closeDb();
  }));

program
  .command("label <session-id> <label>")
  .description("Add label to session (use 'current' for most recent)")
  .action(withErrorHandling((sessionId: unknown, label: unknown) => {
    let targetId = sessionId as string;
    if (targetId === "current") {
      const recent = getMostRecentSession();
      if (!recent) {
        console.log(chalk.red("No sessions found."));
        process.exit(1);
      }
      targetId = recent.session_id;
    }
    const session = getSession(targetId);
    if (!session) {
      console.log(chalk.red(`Session not found: ${targetId}`));
      process.exit(1);
    }
    addLabel(session.session_id, label as string);
    console.log(chalk.green(`Label "${label}" added to session ${session.session_id.slice(0, 12)}`));
    closeDb();
  }));

program
  .command("unlabel <session-id> <label>")
  .description("Remove label from session")
  .action(withErrorHandling((sessionId: unknown, label: unknown) => {
    const session = getSession(sessionId as string);
    if (!session) {
      console.log(chalk.red(`Session not found: ${sessionId}`));
      process.exit(1);
    }
    const removed = removeLabel(session.session_id, label as string);
    if (removed) {
      console.log(chalk.green(`Label "${label}" removed from session ${session.session_id.slice(0, 12)}`));
    } else {
      console.log(chalk.yellow(`Label "${label}" not found on session.`));
    }
    closeDb();
  }));

program
  .command("labels")
  .description("List all labels with aggregate stats")
  .action(withErrorHandling(() => {
    const labels = listAllLabels();
    console.log(formatLabelList(labels));
    closeDb();
  }));

program
  .command("summary")
  .description("Aggregate cost/token summary")
  .option("-l, --label <label>", "Filter by label")
  .option("-d, --days <days>", "Filter by last N days", parseInt)
  .option("--by-model", "Show breakdown by model")
  .action(withErrorHandling((opts: unknown) => {
    const options = opts as { label?: string; days?: number; byModel?: boolean };
    const summary = getSummary({
      label: options.label,
      days: options.days,
    });
    console.log(formatSummary(summary));
    if (options.byModel) {
      const modelSummary = getSummaryByModel({
        label: options.label,
        days: options.days,
      });
      console.log("");
      console.log(formatModelSummary(modelSummary));
    }
    closeDb();
  }));

program
  .command("sync [session-id]")
  .description("Re-parse transcripts and update DB")
  .action(withErrorHandling((sessionId: unknown) => {
    if (sessionId) {
      const ok = syncSession(sessionId as string);
      if (ok) {
        console.log(chalk.green(`Session ${(sessionId as string).slice(0, 12)} synced.`));
      } else {
        console.log(chalk.red(`Session not found or no transcript: ${sessionId}`));
      }
    } else {
      const sessions = getAllSessions();
      let synced = 0;
      for (const s of sessions) {
        if (syncSession(s.session_id)) synced++;
      }
      console.log(chalk.green(`Synced ${synced}/${sessions.length} sessions.`));
    }
    closeDb();
  }));

program
  .command("doctor")
  .description("Discover and sync all sessions from transcript history")
  .action(withErrorHandling(() => {
    console.log(chalk.cyan("Running doctor..."));
    const result = runDoctor();
    console.log("");
    console.log(`  ${chalk.cyan("Transcripts discovered:")} ${result.discovered}`);
    console.log(`  ${chalk.cyan("Existing sessions synced:")} ${result.synced}`);
    console.log(`  ${chalk.cyan("New sessions created:")} ${result.created}`);
    if (result.errors.length > 0) {
      console.log("");
      console.log(chalk.yellow(`  ${result.errors.length} errors:`));
      for (const err of result.errors.slice(0, 10)) {
        console.log(chalk.red(`    ${err}`));
      }
    }
    closeDb();
  }));

program
  .command("outliers")
  .description("Show costliest messages across sessions")
  .option("-d, --days <days>", "Filter by last N days", parseInt)
  .option("-l, --label <label>", "Filter by label")
  .option("-n, --limit <limit>", "Max results", parseInt, 20)
  .action(withErrorHandling((opts: unknown) => {
    const options = opts as { days?: number; label?: string; limit?: number };
    const outliers = getCrossSessionOutliers({
      days: options.days,
      label: options.label,
      limit: options.limit,
    });
    console.log(formatMessageOutliers(outliers, true));
    closeDb();
  }));

program
  .command("install")
  .description("Add hooks to ~/.claude/settings.json")
  .action(async () => {
    try {
      const result = await installHooks();
      console.log(chalk.green("Hooks and status line installed successfully."));
      console.log(`  SessionStart → ${result.startCmd}`);
      console.log(`  SessionEnd   → ${result.endCmd}`);
      console.log(`  StatusLine   → ${result.statusLineCmd}`);
    } catch (err) {
      process.stderr.write(chalk.red((err as Error).message) + "\n");
      closeDb();
      process.exit(1);
    }
  });

program
  .command("uninstall")
  .description("Remove hooks from settings.json")
  .action(withErrorHandling(() => {
    uninstallHooks();
    console.log(chalk.green("Hooks and status line uninstalled successfully."));
  }));

program.parse();
