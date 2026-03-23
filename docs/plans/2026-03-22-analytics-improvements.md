# Analytics Schema Improvements

Feedback from team review of `2026-03-22-analytics-schema-design.md`. To be incorporated before implementation.

## Top 5 (must-have)

### 1. Turn structure + user prompt tracking
Add `turn_number` column to `messages` and store user prompt text (or first ~200 chars). Turns are the natural unit developers think in — "how much did that request cost?" Enables per-prompt cost analysis, conversation waterfall charts, prompt efficiency metrics. Without it, the #1 dashboard question ("what was my most expensive prompt?") is unanswerable.

**Sources:** Product Owner, Frontend Dev, Data Engineer, AI Expert

### 2. Pre-aggregated `daily_stats` table
One row per (date, project_path, model, label) with pre-summed cost, token counts, session count, message count, tool use count. Populated at session end and during sync/doctor. Without it, every time-series chart requires full-table scans with `GROUP BY strftime(...)`. Also include `cache_hit_ratio` as a pre-computed float for sortable/filterable dashboard use.

**Sources:** Frontend Dev, CEO, CTO

### 3. Schema versioning + `parsed_at` for incremental re-parsing
Add a `schema_versions` table with monotonically increasing version and a migration runner. Add `analytics_schema_version` column on sessions so `doctor` can target only sessions parsed under older schemas instead of re-parsing everything. Use `better-sqlite3` transactions per migration step.

**Sources:** QA, CTO, Data Engineer

### 4. Dynamic `model_pricing` table instead of hardcoded config
Move pricing from `config.ts` to a `model_pricing` table with `(model_prefix, effective_date, input, output, cache_creation, cache_read)`. Compute `cost_usd` at query time via JOIN instead of baking it at ingest. Eliminates stale costs when Anthropic changes pricing. Also resolves `session_models` redundancy — derive from `messages` instead.

**Sources:** Data Engineer, CTO, Backend Dev

### 5. Idempotent upserts + UNIQUE constraints on all new tables
- `messages`: `INSERT ... ON CONFLICT(message_id) DO UPDATE`
- `tool_uses`: `UNIQUE(session_id, tool_use_id)` with upsert
- `session_events`: `DELETE WHERE session_id = ? + bulk INSERT` (same pattern as `session_models`)
- Unmatched tool results (interrupted sessions): set `status = 'no_result'` instead of NULL

**Sources:** QA, Data Engineer, Backend Dev

## Honorable mentions (should-have)

### Context growth tracking
Track how `input_tokens` grows turn-over-turn to detect "context blowup" sessions. Add `context_utilization_pct` (input_tokens / model max context). Sessions hitting 80%+ before finishing cost more and produce worse results.

**Source:** AI Expert

### Budget/threshold system
`budgets` table with `(label, period, limit_usd)`. Status line shows "JIRA-123: $37/$50". Color change when approaching threshold. Turns monitoring tool into management tool.

**Source:** Product Owner

### `file_path` extraction on `tool_uses`
Instead of (or alongside) `input_json`, extract `file_path` as a first-class column for file-touching tools (Read, Edit, Write). Enables "which files cost the most?" queries. Drop `input_json` or make it optional to avoid storage bloat.

**Sources:** Product Owner, Data Engineer

### Session outcome tracking
Add `outcome` field on sessions: `completed`, `abandoned`, `context-limit-hit`, `error`. Populated via skill at session end or inferred heuristically (git commit = completed). Bridges gap between cost accounting and ROI measurement.

**Source:** CEO

### Thinking efficiency metric
Flag messages where `thinking_tokens > 5000` but actual output is minimal and no tool use. High "overthinking ratio" correlates with unclear prompts or tasks exceeding model capability — leading indicator of session failure.

**Source:** AI Expert

### Timestamps as INTEGER (Unix epoch)
Store timestamps as Unix milliseconds instead of ISO strings. Integer comparisons are faster for range scans, indexes are smaller. Applies to all timestamp columns across all tables.

**Source:** Backend Dev

### Composite indexes
- `messages(session_id, timestamp)` — covers filter + sort in one B-tree walk
- `tool_uses(session_id, tool_name)` — serves per-session tool breakdown
- `daily_stats(date, project_path)` — time-series with project filter

**Source:** Backend Dev

### Raw JSON escape hatch
Store `raw_json TEXT` on messages (or separate `message_raw` table) for future-proofing against JSONL format changes. Modest storage cost (~few hundred KB per session).

**Source:** CTO

### Weekly digest / shareable reports
`session-log report --week` producing a 15-line text summary: total spend, top 3 projects, week-over-week delta, cache efficiency, sessions per day. Automatable via cron + Slack webhook.

**Source:** CEO

### Git metadata enrichment
Store `git_commit_count` per session. Enables "cost per PR" analysis when combined with `git_branch` and labels.

**Source:** CEO

### `user_id` column for future multi-user support
Default to local machine username. Enables data export and aggregation into shared databases without schema changes.

**Source:** CTO
