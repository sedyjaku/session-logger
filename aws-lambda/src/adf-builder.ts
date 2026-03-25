import type { JiraSyncSessionDetail, SessionModelUsage } from "./types.js";

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

function formatDurationWithActive(
  durationSeconds: number | null,
  activeSeconds: number | null
): string {
  const total = formatDuration(durationSeconds);
  const active = formatDuration(activeSeconds);
  if (total === "-" && active === "-") return "-";
  if (active === "-") return total;
  return `${total} (${active} active)`;
}

function formatProject(projectPath: string): string {
  const parts = projectPath.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || projectPath;
}

function formatModel(model: string | null): string {
  if (!model) return "-";
  return model.replace("claude-", "").replace(/-\d+$/, "");
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function buildModelBreakdownTable(models: SessionModelUsage[]) {
  const headerRow = {
    type: "tableRow",
    content: [
      headerCell("Model"),
      headerCell("Input"),
      headerCell("Output"),
      headerCell("Cache Create"),
      headerCell("Cache Read"),
      headerCell("Cost"),
    ],
  };

  const rows = models.map((m) => ({
    type: "tableRow",
    content: [
      textCell(formatModel(m.model)),
      textCell(formatTokens(m.input_tokens)),
      textCell(formatTokens(m.output_tokens)),
      textCell(formatTokens(m.cache_creation_tokens)),
      textCell(formatTokens(m.cache_read_tokens)),
      textCell(`$${m.cost_usd.toFixed(2)}`),
    ],
  }));

  return {
    type: "table",
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    content: [headerRow, ...rows],
  };
}

export function buildCostTable(
  sessions: JiraSyncSessionDetail[],
  totalCost: number
) {
  const totalDuration = sessions.reduce(
    (sum, s) => sum + (s.duration_seconds ?? 0),
    0
  );
  const totalActive = sessions.reduce(
    (sum, s) => sum + (s.active_seconds ?? 0),
    0
  );
  const totalInput = sessions.reduce((sum, s) => sum + s.input_tokens, 0);
  const totalOutput = sessions.reduce((sum, s) => sum + s.output_tokens, 0);
  const totalCacheCreate = sessions.reduce((sum, s) => sum + s.cache_creation_tokens, 0);
  const totalCacheRead = sessions.reduce((sum, s) => sum + s.cache_read_tokens, 0);

  const headerRow = {
    type: "tableRow",
    content: [
      headerCell("Date"),
      headerCell("Duration"),
      headerCell("Project"),
      headerCell("Input"),
      headerCell("Output"),
      headerCell("Cache Cr."),
      headerCell("Cache Rd."),
      headerCell("Cost"),
    ],
  };

  const sessionRows = sessions.map((s) => ({
    type: "tableRow",
    content: [
      textCell(s.date),
      textCell(formatDurationWithActive(s.duration_seconds, s.active_seconds)),
      textCell(formatProject(s.project_path)),
      textCell(formatTokens(s.input_tokens)),
      textCell(formatTokens(s.output_tokens)),
      textCell(formatTokens(s.cache_creation_tokens)),
      textCell(formatTokens(s.cache_read_tokens)),
      textCell(`$${s.cost_usd.toFixed(2)}`),
    ],
  }));

  const totalRow = {
    type: "tableRow",
    content: [
      boldTextCell("Total"),
      boldTextCell(formatDurationWithActive(totalDuration, totalActive)),
      boldTextCell(`${sessions.length} sessions`),
      boldTextCell(formatTokens(totalInput)),
      boldTextCell(formatTokens(totalOutput)),
      boldTextCell(formatTokens(totalCacheCreate)),
      boldTextCell(formatTokens(totalCacheRead)),
      boldTextCell(`$${totalCost.toFixed(2)}`),
    ],
  };

  const allModels = sessions.flatMap((s) => s.models);
  const modelAgg = new Map<string, SessionModelUsage>();
  for (const m of allModels) {
    const existing = modelAgg.get(m.model);
    if (existing) {
      existing.input_tokens += m.input_tokens;
      existing.output_tokens += m.output_tokens;
      existing.cache_creation_tokens += m.cache_creation_tokens;
      existing.cache_read_tokens += m.cache_read_tokens;
      existing.cost_usd += m.cost_usd;
    } else {
      modelAgg.set(m.model, { ...m });
    }
  }

  const content: object[] = [
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
  ];

  if (modelAgg.size > 0) {
    content.push({
      type: "heading",
      attrs: { level: 4 },
      content: [{ type: "text", text: "Model Breakdown" }],
    });
    content.push(
      buildModelBreakdownTable(
        Array.from(modelAgg.values()).sort((a, b) => b.cost_usd - a.cost_usd)
      )
    );
  }

  content.push({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: `Last synced: ${new Date().toISOString().split("T")[0]}`,
        marks: [{ type: "em" }],
      },
    ],
  });

  return {
    version: 1,
    type: "doc",
    content,
  };
}
