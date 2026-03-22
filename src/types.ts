export interface SessionStartInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  source: string;
  model: string;
}

export interface SessionEndInput {
  session_id: string;
  transcript_path: string;
  reason: string;
}

export interface Session {
  id: number;
  session_id: string;
  transcript_path: string | null;
  project_path: string;
  model: string | null;
  source: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
  end_reason: string | null;
  git_branch: string | null;
  claude_version: string | null;
  message_count: number;
  tool_use_count: number;
  thinking_tokens: number;
}

export interface Label {
  id: number;
  name: string;
  created_at: string;
}

export interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

export interface TokenUsage extends TokenCounts {
  model: string;
}

export interface TranscriptMessage extends TokenUsage {
  id: string;
}

export interface CostBreakdown {
  totalCost: number;
  unpricedModels: string[];
  byModel: Record<string, TokenCounts & { cost: number }>;
}

export interface SessionSummary {
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_cost: number;
}

export interface LabelStats {
  name: string;
  session_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_cost: number;
}

export interface ModelBreakdown {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface MessageCost {
  message_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface MessageOutlier extends MessageCost {
  session_id: string;
  project_path: string;
}

export interface ModelSummary {
  model: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_cost: number;
}

export interface ParsedAssistantMessage {
  id: string;
  requestId: string | null;
  model: string;
  timestamp: string;
  stopReason: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  thinking_tokens: number;
  toolUses: ParsedToolUse[];
}

export interface ParsedToolUse {
  toolUseId: string;
  toolName: string;
  inputJson: string;
}

export interface ParsedToolResult {
  toolUseId: string;
  durationMs: number | null;
  totalTokens: number | null;
  status: string | null;
}

export interface ParsedSystemEvent {
  type: string;
  timestamp: string;
  stopReason: string | null;
  durationMs: number | null;
}

export interface FullTranscriptParse {
  messages: ParsedAssistantMessage[];
  toolResults: Map<string, ParsedToolResult>;
  events: ParsedSystemEvent[];
  gitBranch: string | null;
  claudeVersion: string | null;
}
