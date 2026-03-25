# Session Logger

Track and audit Claude Code sessions with labels. Associate token usage and costs with specific tickets, projects, or any custom label for billing, reporting, and usage analysis.

## How It Works

```
SessionStart hook ──→ creates session record in DB

SessionEnd hook ───→ parses transcript JSONL, sums tokens, computes cost,
                       updates session in DB

StatusLine cmd ────→ shows model, context %, cost, duration, and labels
                       in Claude Code's status bar

/session-tag skill ─→ tag the current session with a label from within
                       Claude Code (e.g., /session-tag JIRA-123)

CLI (session-log) ──→ queries DB: list, show, label, summary, doctor, etc.
```

Session Logger integrates with Claude Code via lifecycle hooks, a status line command, and a skill. When you start a Claude Code session, the `SessionStart` hook creates a database record. When the session ends, the `SessionEnd` hook parses the transcript JSONL file, deduplicates streaming messages, calculates token usage and estimated costs, and updates the session record. Labels are applied via the `/session-tag` skill or the `session-log label` CLI command.

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

This adds `SessionStart` and `SessionEnd` hooks, the `StatusLine` command, and the `/session-tag` skill to your Claude Code configuration. Restart Claude Code for changes to take effect.

To remove all integrations:

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

### `jira-sync [ticket-id]`

Sync session costs to Jira via a Lambda proxy. Sessions labeled with Jira ticket IDs (matching pattern `PROJ-123`) have their costs aggregated and posted as a comment on the corresponding Jira ticket. Multiple sessions with the same ticket label are combined into a single comment with a detailed table.

The comment is updated in-place on re-sync — if you log $10 and then $5 more, the Jira comment shows $15 total.

```bash
session-log jira-sync                # sync all detected ticket labels
session-log jira-sync ENG-123        # sync a specific ticket
session-log jira-sync --dry-run      # preview what would be synced
session-log jira-sync --force        # sync even if nothing changed
```

Requires the `JIRA_SYNC_ENDPOINT` environment variable set to the Lambda Function URL:

```bash
export JIRA_SYNC_ENDPOINT=https://your-lambda-url.amazonaws.com
```

The Jira comment renders as:

| Date | Duration | Model | Project | Cost |
|------|----------|-------|---------|------|
| 2026-03-24 | 45m | opus | my-project | $10.00 |
| 2026-03-25 | 12m | sonnet | my-project | $5.00 |
| **Total** | **57m** | | **2 sessions** | **$15.00** |

### `install` / `uninstall`

Register or remove all session-logger integrations from `~/.claude/settings.json`:

- **SessionStart** and **SessionEnd** lifecycle hooks
- **StatusLine** command (appends session labels to the status bar)
- **`/session-tag` skill** (copied to `~/.claude/skills/session-tag/`)

```bash
session-log install
session-log uninstall
```

If a `statusLine` command already exists in settings, `install` backs it up to `~/.claude/session-logger/original-statusline.json` and chains it. `uninstall` restores the original.

## Status Line

Session Logger installs a custom status line into Claude Code that displays key session metrics in the footer bar:

```
Claude Opus 4 | ctx: 42% | $1.37 | 12m 30s | [JIRA-123]
```

| Segment | Source |
|---------|--------|
| Model name | `model.display_name` from Claude Code |
| Context usage | `context_window.used_percentage` |
| Session cost | `cost.total_cost_usd` |
| Duration | `cost.total_duration_ms` |
| Labels | Looked up from the session-logger database |

If the session has no labels, the label segment displays a red warning: `! Session not labeled !`

### Chaining with an existing status line

If you already have a `statusLine` command configured in `~/.claude/settings.json`, `install` backs up the original to `~/.claude/session-logger/original-statusline.json` and chains it via the `--original` flag. The original command's output appears first, followed by the session labels. On `uninstall`, the original status line configuration is restored automatically.

## Session Tag Skill

Session Logger installs a `/session-tag` skill into Claude Code. This lets you tag the current session with a label without leaving the conversation.

Inside a Claude Code session, type:

```
/session-tag JIRA-123
```

To be prompted for a label interactively:

```
/session-tag
```

The skill calls `session-log label current <label>` under the hood. The status line updates automatically on the next assistant response.

The skill is installed to `~/.claude/skills/session-tag/` during `install` and removed during `uninstall`.

## Session Labeling Workflow

### Via the /session-tag Skill

The recommended way to label a session is the `/session-tag` skill inside Claude Code:

```
/session-tag JIRA-123
```

If no label argument is provided, Claude will ask you what label to assign. The status bar updates automatically on the next response.

### Via CLI

```bash
session-log label current JIRA-123      # label the most recent session
session-log label 3135cbcc JIRA-456     # label by session ID prefix
```

### Cost Reporting by Label

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

**jira_syncs** (sync state per ticket)

| Column | Type | Notes |
|--------|------|-------|
| ticket_id | TEXT PK | Jira ticket key (e.g., ENG-123) |
| comment_id | TEXT | Jira comment ID for in-place updates |
| last_synced_at | TEXT | ISO-8601 timestamp |
| total_cost_usd | REAL | Snapshot of total cost at last sync |
| session_count | INTEGER | Snapshot of session count at last sync |

## Project Structure

```
session-loger/
├── package.json
├── tsconfig.json
├── .gitignore
├── bin/
│   └── session-log              # Shebang entry point
├── skills/
│   └── session-tag/
│       └── skill.md             # /session-tag skill definition
├── src/
│   ├── cli.ts                   # Commander program (delegates to services)
│   ├── config.ts                # DB path, model pricing, statusline backup path
│   ├── types.ts                 # TypeScript interfaces
│   ├── jira-sync.types.ts       # Jira sync request/response types
│   ├── db.ts                    # SQLite connection, schema, WAL mode
│   ├── format.ts                # CLI output formatting (tables, detail views)
│   ├── install.ts               # Hook, status line, and skill registration
│   ├── statusline.ts            # StatusLine command (model, cost, duration, labels)
│   ├── utils.ts                 # Shared utilities (readStdin, validateFields)
│   ├── hooks/
│   │   ├── session-start.ts     # SessionStart hook (DB insert)
│   │   └── session-end.ts       # SessionEnd hook (transcript parse + DB update)
│   └── services/
│       ├── session.service.ts   # Session CRUD, sync, query filtering
│       ├── label.service.ts     # Label CRUD, aggregate stats, summaries
│       ├── transcript.service.ts# JSONL parsing, message dedup, token summing
│       ├── cost.service.ts      # Token → USD calculation
│       ├── doctor.service.ts    # Transcript discovery and bulk sync
│       └── jira-sync.service.ts # Jira sync business logic
├── aws-lambda/                  # AWS Lambda — Jira proxy
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── handler.ts           # Lambda entry point
│       ├── jira-client.ts       # Jira REST API v3 calls
│       ├── adf-builder.ts       # Atlassian Document Format table builder
│       ├── local.ts             # Local dev server (wraps handler with http)
│       └── types.ts             # Shared types (duplicated for build isolation)
```

## Jira Sync Lambda

The `aws-lambda/` directory contains an AWS Lambda that acts as a proxy between the session-logger CLI and Jira. Users don't need individual Jira API credentials — the Lambda holds a shared token and is secured by VPN.

### How It Works

```
session-log jira-sync ──→ aggregates sessions by ticket label
                          ──→ POST to Lambda with ticket ID + session table
                                ──→ Lambda creates/updates Jira comment via REST API v3
                                ──→ returns comment ID
                          ──→ stores comment ID locally for future in-place updates
```

### Lambda Environment Variables

| Variable | Description |
|----------|-------------|
| `JIRA_BASE_URL` | Jira instance URL (e.g., `https://yourcompany.atlassian.net`) |
| `JIRA_EMAIL` | Service account email for API auth |
| `JIRA_API_TOKEN` | Jira API token for the service account |

### Local Development

```bash
cd aws-lambda
npm install
JIRA_BASE_URL=https://yourcompany.atlassian.net \
JIRA_EMAIL=service@company.com \
JIRA_API_TOKEN=your-token \
npm run local
```

This starts the Lambda handler on `http://localhost:3001`. Point the CLI at it:

```bash
JIRA_SYNC_ENDPOINT=http://localhost:3001 session-log jira-sync --dry-run
```

### Deployment

```bash
cd aws-lambda
npm run package
```

This compiles TypeScript and creates `function.zip` ready for AWS Lambda upload. Configure the Lambda with a Function URL and the environment variables above.

## Architecture

- **Hooks** run as Claude Code lifecycle hooks via `npx tsx`. They read JSON from stdin, perform DB operations, and always exit 0 (errors are silently caught to never block the user's Claude session).
- **StatusLine** runs as a Claude Code status line command. It reads session JSON from stdin, queries the DB for labels, and outputs a formatted status string. If a previous status line command existed, it chains to it via `--original`.
- **Skills** are Claude Code skill definitions (Markdown files) installed to `~/.claude/skills/`. The `/session-tag` skill instructs Claude to run the CLI `label` command to tag the current session.
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
| Status line not showing | Run `session-log install` and restart Claude Code |
| Status line shows "! Session not labeled !" | Expected for unlabeled sessions — run `/session-tag JIRA-123` or `session-log label current <label>` |
| Status line overwritten by another tool | Re-run `session-log install`; it chains with any pre-existing status line via `--original` |
| /session-tag skill not found | Run `session-log install` to copy the skill to `~/.claude/skills/` |

## Tech Stack

- **TypeScript** + **tsx** (runtime)
- **better-sqlite3** (database)
- **commander** (CLI framework)
- **chalk** (terminal colors)
- **cli-table3** (table formatting)
