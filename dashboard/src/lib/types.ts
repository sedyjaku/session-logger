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

export interface SessionWithLabels extends Session {
  labels: string;
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

export interface ModelSummary {
  model: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_cost: number;
}

export interface SessionSummary {
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_cost: number;
}

export interface MessageOutlier {
  message_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost: number;
  session_id: string;
  project_path: string;
}

export interface DailyCostPoint {
  date: string;
  cost: number;
  sessions: number;
}

export interface DailyCostByModel {
  date: string;
  model: string;
  cost: number;
}

export interface ToolUsageStat {
  tool_name: string;
  count: number;
  avg_duration_ms: number | null;
  total_tokens: number;
}

export interface KpiData {
  current: SessionSummary;
  previous: SessionSummary;
  unlabeledCount: number;
  totalCount: number;
  totalThinkingTokens: number;
}

export interface DashboardFilters {
  days?: number;
  label?: string;
  project?: string;
  model?: string;
}

export interface LabelDetailedStats {
  name: string;
  session_count: number;
  total_cost: number;
  avg_cost: number;
  median_cost: number;
  min_cost: number;
  max_cost: number;
  total_tokens: number;
  total_duration: number;
  last_active: string;
  recent_sessions: number;
  older_sessions: number;
}

export interface ProjectDetailedStats {
  project_path: string;
  session_count: number;
  total_cost: number;
  avg_cost: number;
  median_cost: number;
  min_cost: number;
  max_cost: number;
  total_tokens: number;
  total_duration: number;
  last_active: string;
  recent_sessions: number;
  older_sessions: number;
}

export interface LabelDailyCost {
  name: string;
  date: string;
  cost: number;
}

export interface LabelOutlierSession {
  session_id: string;
  label_name: string;
  cost: number;
  label_avg: number;
  started_at: string;
  project_path: string;
}

export interface ProjectOutlierSession {
  session_id: string;
  project_path: string;
  cost: number;
  project_avg: number;
  started_at: string;
}

export interface ExpensiveLabel {
  name: string;
  avg_cost: number;
  global_avg: number;
  ratio: number;
  session_count: number;
}

export interface ExpensiveProject {
  project_path: string;
  avg_cost: number;
  global_avg: number;
  ratio: number;
  session_count: number;
}
