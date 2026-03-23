import chalk from "chalk";
import Table from "cli-table3";
import type { Session, LabelStats, SessionSummary, ModelBreakdown, MessageCost, MessageOutlier, ModelSummary } from "./types.js";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatSessionList(sessions: Session[], labels: Record<string, string[]>): string {
  if (sessions.length === 0) return chalk.yellow("No sessions found.");

  const table = new Table({
    head: [
      chalk.cyan("Session ID"),
      chalk.cyan("Started"),
      chalk.cyan("Duration"),
      chalk.cyan("Model"),
      chalk.cyan("In Tokens"),
      chalk.cyan("Out Tokens"),
      chalk.cyan("Cost"),
      chalk.cyan("Labels"),
    ],
    colWidths: [14, 20, 10, 20, 12, 12, 10, 20],
    wordWrap: true,
  });

  for (const s of sessions) {
    const labelStr = (labels[s.session_id] || []).join(", ");
    table.push([
      s.session_id.slice(0, 12),
      s.started_at.replace("T", " ").slice(0, 19),
      formatDuration(s.duration_seconds),
      s.model || "-",
      formatTokens(s.input_tokens),
      formatTokens(s.output_tokens),
      formatCost(s.estimated_cost_usd),
      labelStr || "-",
    ]);
  }

  return table.toString();
}

export function formatSessionDetail(session: Session, labels: string[], models?: ModelBreakdown[]): string {
  const labelStr = labels.join(", ") || "none";

  const lines = [
    chalk.bold("Session Details"),
    "",
    `  ${chalk.cyan("Session ID:")}    ${session.session_id}`,
    `  ${chalk.cyan("Project:")}       ${session.project_path}`,
    `  ${chalk.cyan("Model:")}         ${session.model || "-"}`,
    `  ${chalk.cyan("Source:")}        ${session.source || "-"}`,
    `  ${chalk.cyan("Started:")}       ${session.started_at}`,
    `  ${chalk.cyan("Ended:")}         ${session.ended_at || "-"}`,
    `  ${chalk.cyan("Duration:")}      ${formatDuration(session.duration_seconds)}`,
    `  ${chalk.cyan("End Reason:")}    ${session.end_reason || "-"}`,
    `  ${chalk.cyan("Labels:")}        ${labelStr}`,
    "",
    chalk.bold("Token Usage"),
    "",
    `  ${chalk.cyan("Input:")}         ${formatTokens(session.input_tokens)}`,
    `  ${chalk.cyan("Output:")}        ${formatTokens(session.output_tokens)}`,
    `  ${chalk.cyan("Cache Create:")}  ${formatTokens(session.cache_creation_tokens)}`,
    `  ${chalk.cyan("Cache Read:")}    ${formatTokens(session.cache_read_tokens)}`,
    `  ${chalk.cyan("Est. Cost:")}     ${formatCost(session.estimated_cost_usd)}`,
  ];

  if (session.transcript_path) {
    lines.push("", `  ${chalk.cyan("Transcript:")}    ${session.transcript_path}`);
  }

  if (models && models.length > 0) {
    lines.push("", formatModelBreakdown(models));
  }

  return lines.join("\n");
}

export function formatLabelList(labels: LabelStats[]): string {
  if (labels.length === 0) return chalk.yellow("No labels found.");

  const table = new Table({
    head: [
      chalk.cyan("Label"),
      chalk.cyan("Sessions"),
      chalk.cyan("In Tokens"),
      chalk.cyan("Out Tokens"),
      chalk.cyan("Total Cost"),
    ],
  });

  for (const l of labels) {
    table.push([
      l.name,
      String(l.session_count),
      formatTokens(l.total_input_tokens),
      formatTokens(l.total_output_tokens),
      formatCost(l.total_cost),
    ]);
  }

  return table.toString();
}

export function formatSummary(summary: SessionSummary): string {
  const lines = [
    chalk.bold("Summary"),
    "",
    `  ${chalk.cyan("Sessions:")}      ${summary.sessions}`,
    `  ${chalk.cyan("Input:")}         ${formatTokens(summary.input_tokens)}`,
    `  ${chalk.cyan("Output:")}        ${formatTokens(summary.output_tokens)}`,
    `  ${chalk.cyan("Cache Create:")}  ${formatTokens(summary.cache_creation_tokens)}`,
    `  ${chalk.cyan("Cache Read:")}    ${formatTokens(summary.cache_read_tokens)}`,
    `  ${chalk.cyan("Total Cost:")}    ${formatCost(summary.total_cost)}`,
  ];

  return lines.join("\n");
}

export function formatModelBreakdown(models: ModelBreakdown[]): string {
  if (models.length === 0) return chalk.yellow("No model breakdown available.");

  const totalCost = models.reduce((sum, m) => sum + m.cost_usd, 0);

  const table = new Table({
    head: [
      chalk.cyan("Model"),
      chalk.cyan("Input"),
      chalk.cyan("Output"),
      chalk.cyan("Cache Create"),
      chalk.cyan("Cache Read"),
      chalk.cyan("Cost"),
      chalk.cyan("% of Total"),
    ],
  });

  for (const m of models) {
    const pct = totalCost > 0 ? ((m.cost_usd / totalCost) * 100).toFixed(1) : "0.0";
    table.push([
      m.model,
      formatTokens(m.input_tokens),
      formatTokens(m.output_tokens),
      formatTokens(m.cache_creation_tokens),
      formatTokens(m.cache_read_tokens),
      formatCost(m.cost_usd),
      `${pct}%`,
    ]);
  }

  return chalk.bold("Model Breakdown") + "\n" + table.toString();
}

export function formatMessageOutliers(outliers: (MessageCost | MessageOutlier)[], showSession: boolean): string {
  if (outliers.length === 0) return chalk.yellow("No message outliers found.");

  const head = showSession
    ? [chalk.cyan("Msg ID"), chalk.cyan("Session"), chalk.cyan("Model"), chalk.cyan("Input"), chalk.cyan("Output"), chalk.cyan("Cost")]
    : [chalk.cyan("Msg ID"), chalk.cyan("Model"), chalk.cyan("Input"), chalk.cyan("Output"), chalk.cyan("Cost")];

  const table = new Table({ head });

  for (const o of outliers) {
    const row = showSession
      ? [o.message_id.slice(0, 12), (o as MessageOutlier).session_id.slice(0, 12), o.model, formatTokens(o.input_tokens), formatTokens(o.output_tokens), formatCost(o.cost)]
      : [o.message_id.slice(0, 12), o.model, formatTokens(o.input_tokens), formatTokens(o.output_tokens), formatCost(o.cost)];
    table.push(row);
  }

  return chalk.bold("Costliest Messages") + "\n" + table.toString();
}

export function formatModelSummary(models: ModelSummary[]): string {
  if (models.length === 0) return chalk.yellow("No model data available.");

  const table = new Table({
    head: [
      chalk.cyan("Model"),
      chalk.cyan("Sessions"),
      chalk.cyan("Input"),
      chalk.cyan("Output"),
      chalk.cyan("Cache Create"),
      chalk.cyan("Cache Read"),
      chalk.cyan("Total Cost"),
    ],
  });

  for (const m of models) {
    table.push([
      m.model,
      String(m.sessions),
      formatTokens(m.input_tokens),
      formatTokens(m.output_tokens),
      formatTokens(m.cache_creation_tokens),
      formatTokens(m.cache_read_tokens),
      formatCost(m.total_cost),
    ]);
  }

  return chalk.bold("Cost by Model") + "\n" + table.toString();
}
