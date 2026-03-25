export interface JiraSyncSessionDetail {
  session_id: string;
  date: string;
  duration_seconds: number | null;
  model: string | null;
  cost_usd: number;
  project_path: string;
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

export interface JiraSyncRecord {
  ticket_id: string;
  comment_id: string | null;
  last_synced_at: string;
  total_cost_usd: number;
  session_count: number;
}
