# Analytics Schema Design

Extend session-logger DB to capture message-level, tool-level, and event-level data from JSONL transcripts. Enables cost optimization, productivity analysis, tool usage patterns, context management insights, and per-project tracking via labels.

## Data Sources

All data comes from JSONL transcript files parsed at session end, doctor, or sync. No live parsing.

### JSONL Message Types

| Type | Count (typical) | Key Data |
|---|---|---|
| `assistant` | ~100/session | model, tokens, usage, content (thinking/text/tool_use), stop_reason |
| `user` | ~70/session | prompts, tool_result with subagent stats |
| `system` | ~20/session | stop reasons, hook stats, turn duration |
| `progress` | ~200/session | hook/tool execution progress (not stored) |
| `file-history-snapshot` | ~20/session | file backups (not stored) |

## New Tables

### `messages`

One row per assistant message. Core table for cost and productivity analytics.

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  message_id TEXT UNIQUE NOT NULL,
  request_id TEXT,
  model TEXT,
  timestamp TEXT NOT NULL,
  stop_reason TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  has_tool_use INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);
```

### `tool_uses`

One row per tool call. Extracted from `tool_use` content blocks in assistant messages, enriched with result data from corresponding user messages.

```sql
CREATE TABLE IF NOT EXISTS tool_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  message_id TEXT NOT NULL REFERENCES messages(message_id),
  tool_use_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  input_json TEXT,
  duration_ms INTEGER,
  total_tokens INTEGER,
  status TEXT
);

CREATE INDEX IF NOT EXISTS idx_tool_uses_session_id ON tool_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_uses_message_id ON tool_uses(message_id);
CREATE INDEX IF NOT EXISTS idx_tool_uses_tool_name ON tool_uses(tool_name);
```

**Field sources:**
- `tool_use_id`, `tool_name`, `input_json` from assistant message `content[]` where `type = "tool_use"`
- `duration_ms`, `total_tokens`, `status` from next user message's `toolUseResult` (available for Agent/subagent calls)

### `session_events`

System-level events: turn stops, context limits, permission prompts.

```sql
CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  stop_reason TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(type);
CREATE INDEX IF NOT EXISTS idx_session_events_timestamp ON session_events(timestamp);
```

## Additions to Existing `sessions` Table

New columns for denormalized dashboard queries:

```sql
ALTER TABLE sessions ADD COLUMN git_branch TEXT;
ALTER TABLE sessions ADD COLUMN claude_version TEXT;
ALTER TABLE sessions ADD COLUMN message_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN tool_use_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN thinking_tokens INTEGER DEFAULT 0;
```

## Transcript Parsing Changes

Current parsing (`transcript.service.ts`) only reads `type: "assistant"` lines and extracts token usage. New parsing must:

1. Read all line types (assistant, user, system)
2. For `assistant` lines: extract full message content blocks (thinking, text, tool_use)
3. For `user` lines with `toolUseResult`: match back to tool_use by `sourceToolAssistantUUID`
4. For `system` lines: extract stop reasons and duration
5. Deduplicate by `message.id` (last-write-wins, same as current)

## Analytics Queries Enabled

| Goal | Query Pattern |
|---|---|
| Cost by model per week | `messages GROUP BY model, strftime('%W', timestamp)` |
| Cost by label/project | `messages JOIN session_labels JOIN labels` |
| Most expensive tool calls | `tool_uses JOIN messages ORDER BY cost_usd DESC` |
| Tool frequency distribution | `tool_uses GROUP BY tool_name` |
| Avg session duration by day | `sessions GROUP BY date(started_at)` |
| Messages per hour (productivity) | `messages GROUP BY strftime('%H', timestamp)` |
| Context limit frequency | `session_events WHERE type = 'context_limit'` |
| Cache hit ratio | `SUM(cache_read_tokens) / SUM(input_tokens) FROM messages` |
| Thinking vs output ratio | `SUM(thinking_tokens) / SUM(output_tokens) FROM messages` |
| Subagent cost breakdown | `tool_uses WHERE tool_name = 'Agent' JOIN messages` |

## Web UI

Standalone Next.js app reading SQLite directly. Schema designed for direct queries with indexes on all join/filter columns.

## Migration

- New tables created via `CREATE TABLE IF NOT EXISTS` (safe for existing DBs)
- New columns on `sessions` added via `ALTER TABLE ADD COLUMN` with defaults
- Existing sessions backfilled by running `session-log sync` or `session-log doctor`
