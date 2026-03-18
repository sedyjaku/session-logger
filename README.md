# Session Logger

Track and audit Claude Code sessions with Jira ticket labels. Associate token usage and costs with specific Jira tickets for billing, reporting, and usage analysis.

## How It Works

```
SessionStart hook ──→ creates session in DB, prompts for label via /dev/tty
                       (only on source="startup", skips resume/clear/compact)

SessionEnd hook ───→ parses transcript JSONL, sums tokens, computes cost,
                       updates session in DB

CLI (session-log) ─→ queries DB: list, show, label, summary, doctor, etc.
```

Session Logger integrates with Claude Code via lifecycle hooks. When you start a Claude Code session, the `SessionStart` hook creates a database record and optionally prompts you for labels (e.g., `JIRA-123`). When the session ends, the `SessionEnd` hook parses the transcript JSONL file, deduplicates streaming messages, calculates token usage and estimated costs, and updates the session record.

The `doctor` command can retroactively discover and import all historical sessions from `~/.claude/projects/` for sessions that predate installation or were interrupted.

## Installation

### Prerequisites

- Node.js 18+
- Claude Code CLI

### Setup

```bash
cd /path/to/session-loger
npm install
```

### Register Hooks

```bash
npx tsx src/cli.ts install
```

This adds `SessionStart` and `SessionEnd` hooks to `~/.claude/settings.json`. Restart Claude Code for hooks to take effect.

To remove hooks:

```bash
npx tsx src/cli.ts uninstall
```

### Import Historical Sessions

After installing, run `doctor` to discover and import all existing transcript files:

```bash
npx tsx src/cli.ts doctor
```

## CLI Reference

All commands are run via `npx tsx src/cli.ts <command>` or via the `session-log` binary after `npm link`.

### `list`

List sessions with metrics.

```bash
session-log list                     # last 20 sessions
session-log list --label JIRA-123    # filter by label
session-log list --days 7            # last 7 days
session-log list --limit 50          # show 50 results
session-log list --label JIRA-123 --days 30
```

| Column | Description |
|--------|-------------|
| Session ID | First 12 chars of Claude's session UUID |
| Started | Timestamp when session began |
| Duration | Wall-clock duration |
| Model | Primary model used (by token volume) |
| In Tokens | Total input tokens |
| Out Tokens | Total output tokens |
| Cost | Estimated USD cost |
| Labels | Comma-separated labels |

### `show <session-id>`

Show detailed view of a single session. Supports prefix matching (first few characters of the session ID).

```bash
session-log show 3135cbcc
```

Displays: session ID, project path, model, source, timestamps, duration, end reason, labels, full token breakdown (input, output, cache create, cache read), estimated cost, and transcript file path.

### `label <session-id|current> <label>`

Add a label to a session. Use `current` to label the most recent session.

```bash
session-log label current JIRA-123
session-log label 3135cbcc JIRA-456
```

### `unlabel <session-id> <label>`

Remove a label from a session.

```bash
session-log unlabel 3135cbcc JIRA-123
```

### `labels`

List all labels with aggregate stats across all sessions.

```bash
session-log labels
```

| Column | Description |
|--------|-------------|
| Label | Label name |
| Sessions | Number of sessions with this label |
| In Tokens | Total input tokens across sessions |
| Out Tokens | Total output tokens across sessions |
| Total Cost | Sum of estimated costs |

### `summary`

Aggregate cost and token summary across all sessions, with optional filters.

```bash
session-log summary                   # all sessions
session-log summary --label JIRA-123  # single ticket
session-log summary --days 30         # last 30 days
session-log summary --label JIRA-123 --days 7
```

### `sync [session-id]`

Re-parse transcript files and recalculate token usage and costs. Useful after updating model pricing in `config.ts`.

```bash
session-log sync                  # sync all sessions
session-log sync 3135cbcc         # sync one session
```

### `doctor`

Discover all transcript JSONL files in `~/.claude/projects/` and sync them with the database. Creates new session records for transcripts not yet tracked, and updates existing ones.

```bash
session-log doctor
```

This is the fix for interrupted sessions (force-quit terminal, crashes, etc.) — any session with a transcript file on disk will be recovered.

Output:
- **Transcripts discovered**: total JSONL files found
- **Existing sessions synced**: sessions already in DB, updated with latest data
- **New sessions created**: sessions discovered for the first time

### `install` / `uninstall`

Add or remove SessionStart and SessionEnd hooks from `~/.claude/settings.json`.

```bash
session-log install
session-log uninstall
```

## Session Labeling Workflow

### At Session Start

When Claude Code starts a new session (`source="startup"`), the hook prompts via `/dev/tty`:

```
Session labels (comma-separated, Enter to skip): JIRA-123, sprint-42
```

Enter one or more labels separated by commas, or press Enter to skip. Labels are not prompted on `resume`, `clear`, or `compact` events.

### Retroactive Labeling

```bash
session-log label current JIRA-123      # label the most recent session
session-log label 3135cbcc JIRA-456     # label by session ID prefix
```

### Cost Reporting by Ticket

```bash
session-log summary --label JIRA-123
```

## Data Source

Claude Code stores transcripts at `~/.claude/projects/{project}/{sessionId}.jsonl`. Each assistant message in the JSONL contains:

- `message.id` — dedup key (messages appear 3-5 times due to streaming)
- `message.model` — e.g., `claude-opus-4-6`
- `message.usage.input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`

**Dedup strategy**: Map keyed by `message.id`, last-write-wins. Lines are quick-checked for `"type":"assistant"` string before JSON parsing to skip ~80% of lines.

## Cost Model

Pricing per 1 million tokens (configurable in `src/config.ts`):

| Model prefix | Input | Output | Cache Create | Cache Read |
|---|---|---|---|---|
| `claude-opus-4` | $15.00 | $75.00 | $18.75 | $1.50 |
| `claude-sonnet-4` | $3.00 | $15.00 | $3.75 | $0.30 |
| `claude-haiku-4` | $0.80 | $4.00 | $1.00 | $0.08 |

Models are matched by `startsWith` prefix. Unrecognized models are tracked but priced at $0 (reported in cost breakdown).

To update pricing: edit `MODEL_PRICING` in `src/config.ts`, then run `session-log sync` to recalculate all sessions.

## Database

SQLite database at `~/.claude/session-logger/data.db` (WAL mode, busy_timeout=3000ms).

### Schema

**sessions**

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| session_id | TEXT UNIQUE | Claude's session UUID |
| transcript_path | TEXT | Path to JSONL file |
| project_path | TEXT NOT NULL | Working directory |
| model | TEXT | Primary model used |
| source | TEXT | startup/resume/clear/compact/discovered |
| started_at | TEXT NOT NULL | ISO-8601 timestamp |
| ended_at | TEXT | ISO-8601 timestamp |
| duration_seconds | INTEGER | Wall-clock duration |
| input_tokens | INTEGER | Default 0 |
| output_tokens | INTEGER | Default 0 |
| cache_creation_tokens | INTEGER | Default 0 |
| cache_read_tokens | INTEGER | Default 0 |
| estimated_cost_usd | REAL | Default 0 |
| end_reason | TEXT | Why session ended |

**labels**

| Column | Type |
|--------|------|
| id | INTEGER PK |
| name | TEXT UNIQUE |
| created_at | TEXT |

**session_labels** (many-to-many junction)

| Column | Type |
|--------|------|
| session_id | TEXT FK → sessions.session_id |
| label_id | INTEGER FK → labels.id |
| PRIMARY KEY | (session_id, label_id) |

## Project Structure

```
session-loger/
├── package.json
├── tsconfig.json
├── .gitignore
├── bin/
│   └── session-log              # Shebang entry point
├── src/
│   ├── cli.ts                   # Commander program (delegates to services)
│   ├── config.ts                # DB path, model pricing constants
│   ├── types.ts                 # TypeScript interfaces
│   ├── db.ts                    # SQLite connection, schema, WAL mode
│   ├── format.ts                # CLI output formatting (tables, detail views)
│   ├── install.ts               # Hook registration in settings.json
│   ├── utils.ts                 # Shared utilities (readStdin, validateFields)
│   ├── hooks/
│   │   ├── session-start.ts     # SessionStart hook (DB insert + label prompt)
│   │   └── session-end.ts       # SessionEnd hook (transcript parse + DB update)
│   └── services/
│       ├── session.service.ts   # Session CRUD, sync, query filtering
│       ├── label.service.ts     # Label CRUD, aggregate stats, summaries
│       ├── transcript.service.ts# JSONL parsing, message dedup, token summing
│       ├── cost.service.ts      # Token → USD calculation
│       └── doctor.service.ts    # Transcript discovery and bulk sync
```

## Architecture

- **Hooks** run as Claude Code lifecycle hooks via `npx tsx`. They read JSON from stdin, perform DB operations, and always exit 0 (errors are silently caught to never block the user's Claude session).
- **Services** contain all business logic (session management, label CRUD, transcript parsing, cost calculation). No logic in the CLI layer.
- **CLI** is a thin commander wrapper that delegates to services and formats output.
- **Format** is a pure presentation layer — receives data and produces formatted strings. No service or database calls.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Hook not triggering | Run `session-log install` and restart Claude Code |
| Missing sessions | Run `session-log doctor` to backfill from transcripts |
| Wrong costs | Edit pricing in `src/config.ts`, then `session-log sync` |
| $0 cost for a model | Model prefix not in `MODEL_PRICING` — add it and re-sync |
| DB locked errors | WAL mode + busy_timeout should handle this; check for zombie processes |
| Corrupted settings.json | Fix the JSON manually, or delete and reconfigure Claude Code |

## Tech Stack

- **TypeScript** + **tsx** (runtime)
- **better-sqlite3** (database)
- **commander** (CLI framework)
- **chalk** (terminal colors)
- **cli-table3** (table formatting)
