import { readFileSync, existsSync } from "fs";
import type { TokenUsage, TranscriptMessage } from "../types.js";

export function parseTranscript(transcriptPath: string): TokenUsage[] {
  if (!existsSync(transcriptPath)) return [];

  const content = readFileSync(transcriptPath, "utf-8");
  const lines = content.split("\n");
  const messageMap = new Map<string, TranscriptMessage>();

  for (const line of lines) {
    if (!line.includes('"type":"assistant"')) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type !== "assistant") continue;

    const message = parsed.message as Record<string, unknown> | undefined;
    if (!message?.id || !message.usage) continue;

    const usage = message.usage as Record<string, number>;
    const id = message.id as string;

    messageMap.set(id, {
      id,
      model: (message.model as string) || "unknown",
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_tokens: usage.cache_read_input_tokens || 0,
    });
  }

  const byModel = new Map<string, TokenUsage>();

  for (const msg of messageMap.values()) {
    const existing = byModel.get(msg.model);
    if (existing) {
      existing.input_tokens += msg.input_tokens;
      existing.output_tokens += msg.output_tokens;
      existing.cache_creation_tokens += msg.cache_creation_tokens;
      existing.cache_read_tokens += msg.cache_read_tokens;
    } else {
      byModel.set(msg.model, {
        model: msg.model,
        input_tokens: msg.input_tokens,
        output_tokens: msg.output_tokens,
        cache_creation_tokens: msg.cache_creation_tokens,
        cache_read_tokens: msg.cache_read_tokens,
      });
    }
  }

  return Array.from(byModel.values());
}

export function sumTokens(tokensByModel: TokenUsage[]): {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
} {
  return tokensByModel.reduce(
    (acc, t) => ({
      input: acc.input + t.input_tokens,
      output: acc.output + t.output_tokens,
      cacheCreation: acc.cacheCreation + t.cache_creation_tokens,
      cacheRead: acc.cacheRead + t.cache_read_tokens,
    }),
    { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
  );
}

export function getPrimaryModel(tokensByModel: TokenUsage[]): string | null {
  if (tokensByModel.length === 0) return null;
  return tokensByModel.reduce((max, cur) =>
    cur.input_tokens + cur.output_tokens > max.input_tokens + max.output_tokens
      ? cur
      : max
  ).model;
}
