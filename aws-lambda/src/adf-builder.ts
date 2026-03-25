import type { JiraSyncSessionDetail } from "./types.js";

function textCell(text: string) {
  return {
    type: "tableCell",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function boldTextCell(text: string) {
  return {
    type: "tableCell",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text, marks: [{ type: "strong" }] }],
      },
    ],
  };
}

function headerCell(text: string) {
  return {
    type: "tableHeader",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text, marks: [{ type: "strong" }] }],
      },
    ],
  };
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatProject(projectPath: string): string {
  const parts = projectPath.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || projectPath;
}

function formatModel(model: string | null): string {
  if (!model) return "-";
  return model.replace("claude-", "").replace(/-\d+$/, "");
}

export function buildCostTable(
  sessions: JiraSyncSessionDetail[],
  totalCost: number
) {
  const totalDuration = sessions.reduce(
    (sum, s) => sum + (s.duration_seconds ?? 0),
    0
  );

  const headerRow = {
    type: "tableRow",
    content: [
      headerCell("Date"),
      headerCell("Duration"),
      headerCell("Model"),
      headerCell("Project"),
      headerCell("Cost"),
    ],
  };

  const sessionRows = sessions.map((s) => ({
    type: "tableRow",
    content: [
      textCell(s.date),
      textCell(formatDuration(s.duration_seconds)),
      textCell(formatModel(s.model)),
      textCell(formatProject(s.project_path)),
      textCell(`$${s.cost_usd.toFixed(2)}`),
    ],
  }));

  const totalRow = {
    type: "tableRow",
    content: [
      boldTextCell("Total"),
      boldTextCell(formatDuration(totalDuration)),
      textCell(""),
      boldTextCell(`${sessions.length} sessions`),
      boldTextCell(`$${totalCost.toFixed(2)}`),
    ],
  };

  return {
    version: 1,
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Claude Code Session Costs" }],
      },
      {
        type: "table",
        attrs: { isNumberColumnEnabled: false, layout: "default" },
        content: [headerRow, ...sessionRows, totalRow],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `Last synced: ${new Date().toISOString().split("T")[0]}`,
            marks: [{ type: "em" }],
          },
        ],
      },
    ],
  };
}
