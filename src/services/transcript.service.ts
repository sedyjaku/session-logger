import { readFileSync, existsSync } from "fs";
import type {
  TokenUsage,
  TranscriptMessage,
  FullTranscriptParse,
  ParsedAssistantMessage,
  ParsedToolUse,
  ParsedToolResult,
  ParsedSystemEvent,
} from "../types.js";

function parseMessageMap(transcriptPath: string): Map<string, TranscriptMessage> {
  const messageMap = new Map<string, TranscriptMessage>();
  if (!existsSync(transcriptPath)) return messageMap;

  const content = readFileSync(transcriptPath, "utf-8");
  const lines = content.split("\n");

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

  return messageMap;
}

export function parseTranscript(transcriptPath: string): TokenUsage[] {
  const messageMap = parseMessageMap(transcriptPath);
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

export function parseTranscriptMessages(transcriptPath: string): TranscriptMessage[] {
  return Array.from(parseMessageMap(transcriptPath).values());
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

export function parseFullTranscript(transcriptPath: string): FullTranscriptParse {
  const result: FullTranscriptParse = {
    messages: [],
    toolResults: new Map<string, ParsedToolResult>(),
    events: [],
    gitBranch: null,
    claudeVersion: null,
  };

  if (!existsSync(transcriptPath)) return result;

  const content = readFileSync(transcriptPath, "utf-8");
  const lines = content.split("\n");
  const messageMap = new Map<string, ParsedAssistantMessage>();

  for (const line of lines) {
    if (!line.trim()) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!result.gitBranch && typeof parsed.gitBranch === "string") {
      result.gitBranch = parsed.gitBranch;
    }
    if (!result.claudeVersion && typeof parsed.version === "string") {
      result.claudeVersion = parsed.version;
    }

    const type = parsed.type as string | undefined;

    if (type === "assistant") {
      const message = parsed.message as Record<string, unknown> | undefined;
      if (!message?.id) continue;

      const id = message.id as string;
      const usage = (message.usage as Record<string, number>) || {};
      const contentBlocks = (message.content as Record<string, unknown>[]) || [];

      let thinkingTokens = 0;
      const toolUses: ParsedToolUse[] = [];

      for (const block of contentBlocks) {
        if (block.type === "thinking" && typeof block.text === "string") {
          thinkingTokens += (block.text as string).length;
        }
        if (block.type === "tool_use") {
          toolUses.push({
            toolUseId: block.id as string,
            toolName: block.name as string,
            inputJson: JSON.stringify(block.input),
          });
        }
      }

      messageMap.set(id, {
        id,
        requestId: (parsed.requestId as string) || null,
        model: (message.model as string) || "unknown",
        timestamp: (parsed.timestamp as string) || "",
        stopReason: (message.stop_reason as string) || null,
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_creation_tokens: usage.cache_creation_input_tokens || 0,
        cache_read_tokens: usage.cache_read_input_tokens || 0,
        thinking_tokens: thinkingTokens,
        toolUses,
      });
    }

    if (type === "user") {
      const toolUseResult = parsed.toolUseResult as Record<string, unknown> | undefined;
      if (!toolUseResult) continue;

      const messageContent = (parsed.message as Record<string, unknown>)?.content as
        | Record<string, unknown>[]
        | undefined;
      if (!Array.isArray(messageContent)) continue;

      for (const block of messageContent) {
        if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
          result.toolResults.set(block.tool_use_id as string, {
            toolUseId: block.tool_use_id as string,
            durationMs:
              typeof toolUseResult.totalDurationMs === "number"
                ? (toolUseResult.totalDurationMs as number)
                : null,
            totalTokens:
              typeof toolUseResult.totalTokens === "number"
                ? (toolUseResult.totalTokens as number)
                : null,
            status:
              typeof toolUseResult.status === "string"
                ? (toolUseResult.status as string)
                : null,
          });
        }
      }
    }

    if (type === "system" && typeof parsed.subtype === "string") {
      result.events.push({
        type: parsed.subtype as string,
        timestamp: (parsed.timestamp as string) || "",
        stopReason: typeof parsed.stopReason === "string" ? (parsed.stopReason as string) : null,
        durationMs: typeof parsed.durationMs === "number" ? (parsed.durationMs as number) : null,
      });
    }
  }

  result.messages = Array.from(messageMap.values());
  return result;
}
