# Session Logger Dashboard

Web-based analytics dashboard for visualizing Claude Code session costs, token usage, and model performance.

<!-- screenshot -->

## Why This Dashboard

Your team is using Claude Code every day, but how much is it actually costing -- and is that spend delivering value? This dashboard turns raw AI session data into clear financial and usage insights so you can answer questions like: "What did we spend on AI coding tools this month?", "Which projects or features are consuming the most?", and "Are there sessions burning money that shouldn't be?" It gives engineering managers, CTOs, and finance teams the visibility they need to set budgets, justify AI tool investments, and spot waste before it grows.

## Features

- **Overview** -- KPI cards with period-over-period deltas, daily cost trend, model distribution, cost by label, and recent sessions
- **Cost Analysis** -- Deep cost breakdown by model, label, and project with cache savings estimates and costliest message outliers
- **Sessions** -- Searchable, paginated session list with inline labels and drill-through to individual session detail
- **Session Detail** -- Per-session view with model breakdown, message cost timeline chart, costliest messages, and tool usage stats
- **Labels & Projects** -- Tabular view of cost and session counts grouped by label or project path
- **Models** -- Per-model cost cards, cost-over-time chart, full token breakdown table, and cache efficiency trend

All pages share a global filter bar for time range, label, project, and model.

## Prerequisites

| Requirement | Minimum version |
|---|---|
| Node.js | 18+ |
| session-loger (parent project) | Installed with data in `~/.claude/session-logger/data.db` |

The dashboard reads from the SQLite database created by the parent `session-loger` project. You need at least one imported session. Run `session-log doctor` in the parent project to discover and import historical transcripts if you have not already.

## Quick Start

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Alternative: CLI Launch

If you have the parent `session-loger` project set up (via `npm link` or direct invocation), you can start the dashboard from anywhere:

```bash
session-log dashboard
```

To use a custom port:

```bash
session-log dashboard --port 4000
```

## Pages

### Overview (`/`)

Answers: *How much am I spending? Is it going up or down? Which models and labels account for the most cost?*

- How much are we spending on AI coding tools this month, and is that up or down compared to last month?
- Which AI models are consuming the most budget, and how is spending distributed across them?
- What percentage of sessions are going untracked (unlabeled), creating blind spots in our cost reporting?

### Cost Analysis (`/cost`)

Answers: *Where exactly is money going? How much am I saving from caching? Which individual messages cost the most?*

- Where exactly is the money going -- broken down by model, project, and label?
- How much money are we saving through caching (context reuse), and what would we have spent without it?
- Which individual AI interactions were the most expensive, and could any of them have been avoided?

### Sessions (`/sessions`)

Answers: *What sessions have I run? How do I find a specific session?*

- How many AI coding sessions are happening across the team, and how long do they typically last?
- Which sessions are tagged to which tickets or initiatives, and which ones are unaccounted for?
- Can I find a specific session to investigate an unusually high cost or a particular project?

### Session Detail (`/sessions/[id]`)

Answers: *What happened in this session? Which messages drove the cost? What tools were used?*

- Metadata grid: Project, Model, Git Branch, Started, Ended, Duration, End Reason, Labels
- KPI cards: Cost, Messages, Tool Uses, Cache Ratio
- Message cost timeline chart, costliest messages table, and tool usage breakdown

### Labels & Projects (`/labels`)

Answers: *How much has a specific ticket or project cost?*

- How much have we spent on a specific feature, JIRA ticket, or initiative?
- Which projects are consuming the most AI budget, and how does cost compare across them?
- How does per-session cost vary between different work streams?

### Models (`/models`)

Answers: *How do models compare? Is caching working well? Are we using expensive models unnecessarily?*

- Are we using expensive AI models when cheaper ones would work just as well?
- How has model usage shifted over time -- are we migrating to more cost-effective options?
- Is our caching efficiency improving or declining, and how does it differ by model?

## Filters

A sticky filter bar appears below the navigation on every page. Filters are applied via URL query parameters, so filtered views are shareable and bookmarkable.

| Filter | Control | Query param | Default |
|---|---|---|---|
| Time range | Segmented button group | `days` | `30` |
| Label | Dropdown | `label` | All |
| Project | Dropdown | `project` | All |
| Model | Dropdown | `model` | All |

Available presets for time range: **7d**, **30d**, **90d**, **All**.

## Key Metrics Glossary

| Metric | What it means | Why it matters |
|--------|--------------|----------------|
| **Total Spend** | The total dollar amount spent on Claude Code usage during the selected period. | Your primary budget number. Compare month-over-month to track trends. |
| **Avg Cost / Session** | Total spend divided by the number of AI coding sessions. | Tells you how expensive a typical AI interaction is. A rising average may signal inefficient usage. |
| **Cache Hit Ratio** | The percentage of AI requests that reused previously processed context instead of reprocessing from scratch. | Higher is better. A high ratio means the system is efficiently reusing prior work, keeping costs down. |
| **Thinking Ratio** | How much of the AI's output was spent on internal reasoning relative to the visible response. Shown as a multiplier (e.g., "2.5x"). | A very high ratio may indicate the AI is over-reasoning on straightforward tasks. Useful for spotting sessions where a cheaper model might suffice. |
| **Cache Savings** | The estimated dollar amount saved because the system reused cached context instead of reprocessing at full price. | Quantifies real cost avoidance. Lets you show the ROI of efficient session patterns. |
| **Unlabeled %** | The percentage of sessions not tagged with a label (JIRA ticket, project, team). | Unlabeled sessions are invisible to cost-per-feature reporting. The dashboard flags this in red when it exceeds 30%. |

## Tips for Getting Value

1. **Label every session with a JIRA ticket or project name.** The dashboard can only attribute costs to features, tickets, or teams if sessions are labeled. Use the `/session-tag` command during a session. Watch the "Unlabeled %" metric -- aim to keep it under 10%.

2. **Review the Cost page weekly to catch expensive outliers.** The "Costliest Messages" table surfaces individual AI interactions that consumed the most budget. One expensive outlier can equal a week of normal usage.

3. **Use the Models page to right-size model selection.** Not every coding task needs the most powerful (and most expensive) model. If a large share of spend goes to the top-tier model but sessions are short and simple, talk to your team about when to use a lighter model.

4. **Compare cost-per-session across labels and projects to benchmark productivity.** If one feature costs 3x more per session than another of similar complexity, it may point to unclear requirements or a codebase that is harder for the AI to work with.

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Components) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4 |
| Charts | Recharts 2 |
| Database | better-sqlite3 (read-only connection) |

### Data Flow

The dashboard connects directly to the SQLite database at `~/.claude/session-logger/data.db` using a read-only `better-sqlite3` connection. All data fetching happens server-side in React Server Components. Pages are rendered with `force-dynamic` to always reflect the latest data.

### Project Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (TopNav + FilterBar)
│   │   ├── page.tsx                # Overview
│   │   ├── cost/page.tsx           # Cost Analysis
│   │   ├── sessions/
│   │   │   ├── page.tsx            # Sessions list
│   │   │   └── [id]/page.tsx       # Session detail
│   │   ├── labels/page.tsx         # Labels & Projects
│   │   └── models/page.tsx         # Models
│   ├── components/
│   │   ├── cards/kpi-card.tsx
│   │   ├── charts/                 # Recharts wrappers
│   │   ├── filters/                # FilterBar, ViewToggle
│   │   └── layout/top-nav.tsx
│   └── lib/
│       ├── db.ts                   # SQLite connection
│       ├── queries.ts              # All SQL queries
│       ├── types.ts                # TypeScript interfaces
│       ├── format.ts               # Formatting helpers
│       ├── derived-metrics.ts      # Computed metrics
│       └── utils.ts                # Class merging utility
```

## Configuration

### Database Path

The database path is `~/.claude/session-logger/data.db` (hardcoded in `src/lib/db.ts`). This matches the default path used by the parent `session-loger` project.

### Port

Default development port is `3000`. Override with:

```bash
npm run dev -- -p 4000
# or
session-log dashboard --port 4000
```

## Development

### Adding a New Page

1. Create a directory under `src/app/` with a `page.tsx` file.
2. Add the route to `navItems` in `src/components/layout/top-nav.tsx`.
3. Accept `searchParams` as a prop and use the filter parsing pattern to honor the global filter bar.
4. Call query functions from `src/lib/queries.ts` to fetch data server-side.

### Adding a New Query

1. Add the SQL query as a function in `src/lib/queries.ts`.
2. Define return types in `src/lib/types.ts`.
3. Use `buildFilter()` to apply the standard filters (days, label, project, model).

### Adding a New Chart

1. Create a client component in `src/components/charts/` (add `"use client"` directive).
2. Use Recharts. Existing charts follow the pattern of accepting a typed `data` prop.
3. Import and render the chart from a server component page.
