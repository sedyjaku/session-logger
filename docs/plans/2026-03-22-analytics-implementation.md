# Analytics Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add message-level, tool-use-level, and event-level tables to the session-logger DB, extend the transcript parser to populate them, and update existing queries to use the new data.

**Architecture:** Extend `db.ts` schema with 3 new tables + ALTER columns on sessions. Extend `transcript.service.ts` to parse all JSONL line types (assistant, user, system) with dedup. Add new DB writer functions in `session.service.ts`. Update `endSession`, `syncSession`, and `runDoctor` to populate new tables alongside existing ones.

**Tech Stack:** TypeScript, better-sqlite3, existing CLI framework (commander)

---

### Task 1: Add new types to `types.ts`

**Files:**
- Modify: `src/types.ts`

**Step 1: Add new interfaces**

Add these interfaces after the existing ones:

```typescript
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
```

Also add new columns to the existing `Session` interface:

```typescript
git_branch: string | null;
claude_version: string | null;
message_count: number;
tool_use_count: number;
thinking_tokens: number;
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: May show errors in files that destructure Session — the new fields will be undefined from existing DB rows but that's fine since they have DEFAULT values in SQL. Fix any type errors.

**Step 3: Commit**

```
git add src/types.ts
git commit -m "feat: add analytics types for messages, tool_uses, session_events"
```

---

### Task 2: Extend DB schema in `db.ts`

**Files:**
- Modify: `src/db.ts`

**Step 1: Add new tables**

Add inside `createSchema`, appended to the existing `db.exec()` template literal:

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

**Step 2: Add ALTER TABLE migrations for new session columns**

Add a new function called after `createSchema` in `getDb`:

```typescript
function runMigrations(db: Database.Database): void {
  const alters = [
    "ALTER TABLE sessions ADD COLUMN git_branch TEXT",
    "ALTER TABLE sessions ADD COLUMN claude_version TEXT",
    "ALTER TABLE sessions ADD COLUMN message_count INTEGER DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN tool_use_count INTEGER DEFAULT 0",
    "ALTER TABLE sessions ADD COLUMN thinking_tokens INTEGER DEFAULT 0",
  ];
  for (const sql of alters) {
    try { db.exec(sql); } catch {}
  }
}
```

Call `runMigrations(instance)` right after `createSchema(instance)` in `getDb`.

**Step 3: Verify DB opens without errors**

Run: `npx tsx src/cli.ts list --limit 1`
Expected: Normal output, no errors.

**Step 4: Commit**

```
git add src/db.ts
git commit -m "feat: add messages, tool_uses, session_events tables and session columns"
```

---

### Task 3: Build the full transcript parser

**Files:**
- Modify: `src/services/transcript.service.ts`

**Step 1: Add `parseFullTranscript` function**

Keep existing functions untouched. Add a new exported function that parses all JSONL line types:

- For `type === "assistant"`: extract message.id, requestId, model, usage, stop_reason, timestamp from envelope. Parse content blocks for thinking (count chars) and tool_use (extract id, name, input).
- For `type === "user"` with `toolUseResult`: extract tool_result blocks from message.content to get tool_use_id. Map toolUseResult fields (totalDurationMs, totalTokens, status) keyed by tool_use_id.
- For `type === "system"` with `subtype`: extract subtype as event type, timestamp, stopReason, durationMs.
- Extract `gitBranch` and `version` from the first line that has them.
- Dedup assistant messages by message.id (last-write-wins, same as current pattern).
- Return `FullTranscriptParse` struct.

Import the new types from `../types.js`.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```
git add src/services/transcript.service.ts
git commit -m "feat: add parseFullTranscript for messages, tool_uses, events"
```

---

### Task 4: Add DB write functions for analytics data

**Files:**
- Modify: `src/services/session.service.ts`

**Step 1: Add `upsertAnalytics` function**

Import `parseFullTranscript` and `MODEL_PRICING`. Add function that:
1. Calls `parseFullTranscript(transcriptPath)`
2. Deletes existing rows: `DELETE FROM tool_uses WHERE session_id = ?`, then `DELETE FROM messages WHERE session_id = ?`, then `DELETE FROM session_events WHERE session_id = ?` (tool_uses first due to FK)
3. In a transaction, inserts all messages (computing cost_usd per message using MODEL_PRICING), all tool_uses (matching tool results from the parsed map), and all events
4. Updates sessions table with `git_branch`, `claude_version`, `message_count`, `tool_use_count`, `thinking_tokens`

Use `db.transaction()` for atomicity.

**Step 2: Call `upsertAnalytics` from `endSession`**

After the existing `upsertModelBreakdown(sessionId, costBreakdown)` call, add:
```typescript
upsertAnalytics(sessionId, transcriptPath);
```

**Step 3: Call `upsertAnalytics` from `syncSession`**

After the existing `upsertModelBreakdown(sessionId, costBreakdown)` call, add:
```typescript
upsertAnalytics(sessionId, session.transcript_path);
```

**Step 4: Export a wrapper for doctor**

```typescript
export function upsertAnalyticsForDoctor(sessionId: string, transcriptPath: string): void {
  upsertAnalytics(sessionId, transcriptPath);
}
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```
git add src/services/session.service.ts
git commit -m "feat: upsertAnalytics writes messages, tool_uses, session_events on end/sync"
```

---

### Task 5: Update doctor to populate analytics

**Files:**
- Modify: `src/services/doctor.service.ts`

**Step 1: Import and call `upsertAnalyticsForDoctor`**

Add import:
```typescript
import { upsertModelBreakdownForDoctor, upsertAnalyticsForDoctor } from "./session.service.js";
```

After the existing `upsertModelBreakdownForDoctor(t.sessionId, costBreakdown)` call inside the loop, add:
```typescript
upsertAnalyticsForDoctor(t.sessionId, t.transcriptPath);
```

**Step 2: Verify with doctor**

Run: `npx tsx src/cli.ts doctor`
Expected: Normal output with counts. No errors.

**Step 3: Verify data was written**

Run: `sqlite3 ~/.claude/session-logger/data.db "SELECT COUNT(*) FROM messages; SELECT COUNT(*) FROM tool_uses; SELECT COUNT(*) FROM session_events;"`
Expected: Non-zero counts for messages and tool_uses.

**Step 4: Commit**

```
git add src/services/doctor.service.ts
git commit -m "feat: doctor populates analytics tables on discovery/sync"
```

---

### Task 6: Update outlier queries to use DB instead of re-parsing JSONL

**Files:**
- Modify: `src/services/session.service.ts`

**Step 1: Rewrite `getMessageOutliers`**

Replace current implementation (which re-parses JSONL) with a DB query:

```typescript
export function getMessageOutliers(sessionId: string, limit = 10): MessageCost[] {
  const db = getDb();
  return db.prepare(
    `SELECT message_id, model, input_tokens, output_tokens,
      cache_creation_tokens, cache_read_tokens, cost_usd as cost
     FROM messages WHERE session_id = ?
     ORDER BY cost_usd DESC LIMIT ?`
  ).all(sessionId, limit) as MessageCost[];
}
```

**Step 2: Rewrite `getCrossSessionOutliers`**

Replace current implementation (which re-parses all JSONL files) with a DB query:

```typescript
export function getCrossSessionOutliers(options: {
  label?: string;
  days?: number;
  limit?: number;
}): MessageOutlier[] {
  const db = getDb();
  const { where, params } = buildSessionFilter(options);
  const limit = options.limit || 20;

  return db.prepare(
    `SELECT m.message_id, m.model, m.input_tokens, m.output_tokens,
      m.cache_creation_tokens, m.cache_read_tokens, m.cost_usd as cost,
      s.session_id, s.project_path
     FROM messages m
     JOIN sessions s ON m.session_id = s.session_id
     ${where}
     ORDER BY m.cost_usd DESC LIMIT ?`
  ).all(...params, limit) as MessageOutlier[];
}
```

**Step 3: Remove unused imports**

Remove `parseTranscriptMessages` and `calculateMessageCosts` imports if no longer used.

**Step 4: Verify TypeScript compiles and test**

Run: `npx tsc --noEmit`
Run: `npx tsx src/cli.ts outliers --limit 5`
Expected: Same output format, now from DB.

**Step 5: Commit**

```
git add src/services/session.service.ts
git commit -m "refactor: outliers queries use messages table instead of re-parsing JSONL"
```

---

### Task 7: End-to-end verification

**Step 1: Run doctor to populate all analytics data**

Run: `npx tsx src/cli.ts doctor`

**Step 2: Verify messages table**

Run: `sqlite3 ~/.claude/session-logger/data.db "SELECT session_id, COUNT(*) as msg_count, SUM(cost_usd) as total_cost, SUM(thinking_tokens) as think FROM messages GROUP BY session_id LIMIT 5;"`

**Step 3: Verify tool_uses table**

Run: `sqlite3 ~/.claude/session-logger/data.db "SELECT tool_name, COUNT(*) as cnt FROM tool_uses GROUP BY tool_name ORDER BY cnt DESC LIMIT 10;"`

**Step 4: Verify session columns**

Run: `sqlite3 ~/.claude/session-logger/data.db "SELECT session_id, message_count, tool_use_count, thinking_tokens, git_branch, claude_version FROM sessions WHERE message_count > 0 LIMIT 5;"`

**Step 5: Verify existing commands still work**

Run: `npx tsx src/cli.ts list --limit 3`
Run: `npx tsx src/cli.ts summary`
Run: `npx tsx src/cli.ts outliers --limit 3`

All should produce normal output with no errors.

**Step 6: Commit any fixups**

```
git add -A
git commit -m "fix: adjustments from end-to-end verification"
```
