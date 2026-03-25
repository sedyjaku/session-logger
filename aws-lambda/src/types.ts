export interface SessionModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface JiraSyncSessionDetail {
  session_id: string;
  date: string;
  duration_seconds: number | null;
  active_seconds: number | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  project_path: string;
  models: SessionModelUsage[];
}

export interface JiraSyncRequest {
  ticket_id: string;
  comment_id?: string;
  total_cost_usd: number;
  session_count: number;
  sessions: JiraSyncSessionDetail[];
}

export interface JiraSyncResponse {
  success: boolean;
  comment_id: string;
  error?: string;
}
