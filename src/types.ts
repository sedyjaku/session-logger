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
