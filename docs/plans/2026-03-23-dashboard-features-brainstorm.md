# Dashboard Feature Brainstorm

**Date:** 2026-03-23
**Stakeholders consulted:** CEO, CTO, Product Owner, Team Lead, Senior Developer, QA/Analyst, FinOps

## Executive Summary

7 stakeholder personas analyzed the existing session-logger data model and dashboard, producing ~45 feature proposals. After deduplication and cross-referencing, these consolidate into **15 distinct feature themes** grouped into 4 tiers.

All features are powered by data already captured in the schema (sessions, messages, tool_uses, session_events, session_models, session_labels, labels). Only 1 feature requires a new table (`budgets`). The `projectedMonthlySpend()` function in `derived-metrics.ts` is already implemented but never wired to the UI.

---

## Tier 1: High Impact, Low Effort (Quick Wins)

### 1. Budget Tracker & Burn-Rate Forecast

**Championed by:** CEO, Team Lead, QA, FinOps (all 4 mentioned this)

**What:** Monthly budget gauge (actual vs. limit vs. projected), daily burn-rate trendline, configurable thresholds per project/label. Alert banner when projected spend exceeds budget.

**Key insight:** `projectedMonthlySpend()` already exists in `derived-metrics.ts` but is **dead code** -- never displayed anywhere. This is the single fastest win.

**Data:** `sessions.estimated_cost_usd` + `started_at`, new `budgets` table for thresholds.

**New queries:** 1 (daily sum check). **New pages:** gauge on Overview. **Schema change:** 1 small table.

---

### 2. Waste & Struggling Session Detection

**Championed by:** CEO, Team Lead, FinOps

**What:** Three waste categories surfaced in a single panel:
- **Abandoned sessions** -- `message_count <= 2` with non-trivial cost, or `end_reason = 'interrupted'`
- **Context-limit blowouts** -- sessions with `session_events.type = 'context_limit'` (paid for context twice)
- **Tool failure loops** -- sessions where `tool_uses.status` failure rate exceeds 30%

Aggregate "Estimated Waste" KPI in dollars at the top.

**Data:** `sessions.end_reason`, `session_events.type`, `tool_uses.status`, `sessions.estimated_cost_usd`.

**New queries:** 2-3. **New pages:** `/waste` or panel on Overview. **Schema change:** none.

---

### 3. Data Quality Scorecard

**Championed by:** QA

**What:** Panel showing data hygiene metrics:
- Missing labels (% unlabeled sessions -- already computed as `unlabeledCount` but not actionable)
- Incomplete sessions (`ended_at IS NULL` or `message_count = 0`)
- Zero-cost sessions with messages (pricing lookup failures)
- Tool parse failures

**Key insight:** `doctor.service.ts` silently catches errors; `endSession` silently creates sessions with `project_path = "unknown"`. These corrupt aggregates.

**Data:** All existing tables, LEFT JOINs for gaps. **New queries:** 1-2. **Schema change:** none.

---

### 4. Cost Distribution Histograms

**Championed by:** QA

**What:** Replace misleading averages with histograms + percentile bands (P50, P75, P90, P99) for session cost, duration, and tokens. Mini sparkline distributions on KPI cards.

**Data:** `sessions.estimated_cost_usd`, `sessions.duration_seconds`. **New queries:** 1 (sorted values, compute percentiles in TS). **Schema change:** none.

---

## Tier 2: High Impact, Medium Effort (Core Features)

### 5. Model Selection & What-If Simulator

**Championed by:** CEO, CTO, Team Lead, FinOps (all 4 mentioned this)

**What:** Side-by-side model comparison (avg cost, cache ratio, tool success, thinking ratio). **"What-if" simulator:** re-price actual Opus token volumes at Sonnet rates (and vice versa) to show savings. Scatter plot of cost vs. tool use count by model.

**Key insight:** Model choice is the single largest cost lever (Opus is 5x Sonnet). Many tasks that run on Opus would work fine on Sonnet.

**Data:** `session_models` for token breakdown, `MODEL_PRICING` from `config.ts`. **New queries:** 1-2. **New pages:** extend Models page. **Schema change:** none.

---

### 6. Tool Effectiveness Deep Dive

**Championed by:** CTO, Team Lead, Senior Dev, QA (all 4 mentioned this)

**What:**
- Tool frequency ranking with trends over time
- **Failure rate per tool** (`tool_uses.status` -- currently stored but never displayed)
- **Duration outliers** (P95 duration per tool)
- **Tool sequences** (most common 2-3 tool chains, e.g., Read->Edit->Read)
- **Cost per successful tool use**
- **Retry detection** (consecutive same-tool calls)

**Data:** `tool_uses.tool_name`, `status`, `duration_ms`, `total_tokens`, `input_json`. **New queries:** 3-4. **New pages:** `/tools`. **Schema change:** none.

---

### 7. Cost Anomaly Detection

**Championed by:** CTO, QA, Senior Dev, FinOps

**What:** Z-score flagging per model+project cohort (sessions >2 std dev above mean). Per-message cost velocity chart (cumulative cost over message index -- sudden jumps reveal the exact message that caused a blowout). Daily anomaly timeline overlay on cost chart.

**Key insight:** Absolute "costliest" rankings always surface Opus sessions. What matters is *relative* anomalies within the same cohort.

**Data:** `sessions.estimated_cost_usd`, `messages.cost_usd`, `session_events.type`. **New queries:** 2. **Schema change:** none.

---

### 8. Chargeback & Tagging Compliance Report

**Championed by:** PO, FinOps, CEO

**What:** Exportable (CSV) monthly cost report by label/team. Each row: label, session count, cost, % of total, avg cost/session. "Unallocated" row for untagged sessions. Tagging compliance trend line (daily % of sessions labeled). Dollar amount of "unchargeable" spend.

**Data:** `session_labels` + `labels` + `sessions`. **New queries:** 1-2. **New pages:** extend Labels page + export endpoint. **Schema change:** none.

---

### 9. Productivity Heatmap (Hour/Day)

**Championed by:** Senior Dev, CTO

**What:** GitHub-style heatmap (7 rows x 24 columns) colored by session count, cost, or efficiency. Peak hours summary. Cross-reference with context-limit frequency by time slot.

**Data:** `sessions.started_at` (extract hour/dow via `strftime`). **New queries:** 1. **New pages:** `/insights`. **Schema change:** none.

---

### 10. Session Efficiency Score

**Championed by:** Senior Dev, Team Lead

**What:** Composite 0-100 score per session blending: output density (tokens per dollar), cache utilization, tool success rate, context headroom (penalty for context limits), clean completion. Displayed as badge on sessions list + scatter plot (cost vs. efficiency).

**Data:** `sessions.*`, `tool_uses.status`, `session_events.type`. **New queries:** 1. **New derived metric function.** **Schema change:** none.

---

## Tier 3: Medium Impact, Medium-High Effort (Strategic)

### 11. Ticket & Sprint Cost Tracking

**Championed by:** PO

**What:**
- **Ticket cost rollup:** group by label with hierarchy (prefix = epic, e.g., `PROJ-*` rolls up to `PROJ`)
- **Sprint report:** date-range scoped view with daily cost accumulation, sprint-over-sprint comparison
- **Story complexity scatter:** each dot = ticket label, x = session count, y = cost, size = duration
- **Branch-to-ticket reconciliation:** match `git_branch` to labels, flag untracked work

**Data:** `session_labels`, `labels`, `sessions.git_branch`. **New queries:** 3-4. **New pages:** extend Labels or new `/delivery`. **Schema change:** none.

---

### 12. Cache Optimization Advisor

**Championed by:** CTO, FinOps

**What:** Per-project/model cache efficiency breakdown. Scatter of cache hit ratio vs. input tokens. "Cache-cold" session identification (ratio < 20%). "Missed savings" KPI: what you'd save if low-cache sessions matched fleet average.

**Data:** `sessions.cache_read_tokens`, `sessions.input_tokens`, `session_models.*`. **New queries:** 1-2. **Schema change:** none.

---

### 13. Thinking Token Efficiency

**Championed by:** CTO

**What:** Per-model thinking ratio comparison, time-series trend, correlation with tool success rate, "thinking cost" as % of output spend. Sessions with highest thinking-to-output ratios flagged.

**Key insight:** Thinking tokens cost the same as output tokens ($75/M on Opus). If high thinking doesn't correlate with better tool success, you're overpaying.

**Data:** `sessions.thinking_tokens`, `messages.thinking_tokens`, `tool_uses.status`. **New queries:** 1-2. **Schema change:** none.

---

### 14. Weekly Digest & Export

**Championed by:** CEO, Team Lead, QA

**What:**
- **Dashboard export:** CSV/JSON download button on each page
- **CLI report command:** `session-log report --period weekly` for Slack/email integration
- **Executive digest page:** single-page summary with week-over-week deltas, top projects, model mix, projected monthly spend

**Key insight:** All underlying queries already exist. This is mostly UI/export plumbing.

**Data:** All existing queries. **New queries:** 0. **New: API routes + CLI command.** **Schema change:** none.

---

## Tier 4: High Effort, High Delight (Innovation)

### 15. Workflow Tips Engine (Data-Driven Recommendations)

**Championed by:** Senior Dev

**What:** Personalized, data-driven tips card on Overview:
- "68% of your Opus sessions used <2K thinking tokens -- try Sonnet"
- "Your cache hit ratio dropped 30% this week -- $8 more than last week"
- "Bash tool fails 24% of the time -- add shell setup to CLAUDE.md"
- "You're most efficient 9am-12pm (score 78) vs 8pm-11pm (score 42)"
- "34% of sessions unlabeled -- label for better ROI tracking"

Each tip = a threshold function over aggregated data, fired only when the condition is met.

**Data:** Composites all queries above. **Implementation:** Rules engine in `derived-metrics.ts`. **Schema change:** none.

---

## Consolidated Priority Matrix

| # | Feature | Stakeholder Consensus | Effort | Schema Change | Quick Win? |
|---|---------|:---------------------:|:------:|:-------------:|:----------:|
| 1 | Budget Tracker & Forecast | 4/7 | Low | 1 table | YES |
| 2 | Waste Detection | 3/7 | Low | none | YES |
| 3 | Data Quality Scorecard | 1/7 | Low | none | YES |
| 4 | Cost Distributions | 1/7 | Low | none | YES |
| 5 | Model What-If Simulator | 4/7 | Medium | none | |
| 6 | Tool Effectiveness | 4/7 | Medium | none | |
| 7 | Anomaly Detection | 4/7 | Medium | none | |
| 8 | Chargeback & Tagging | 3/7 | Medium | none | |
| 9 | Productivity Heatmap | 2/7 | Medium | none | |
| 10 | Session Efficiency Score | 2/7 | Medium | none | |
| 11 | Ticket & Sprint Tracking | 1/7 | Med-High | none | |
| 12 | Cache Optimizer | 2/7 | Medium | none | |
| 13 | Thinking Token Analysis | 1/7 | Medium | none | |
| 14 | Weekly Digest & Export | 3/7 | Medium | none | |
| 15 | Workflow Tips Engine | 1/7 | High | none | |

## Recommended Build Order

**Phase 1 (Quick wins):** #1 Budget Tracker (wire up existing dead code!) -> #2 Waste Detection -> #4 Cost Distributions -> #3 Data Quality

**Phase 2 (Core analytics):** #5 Model What-If -> #6 Tool Effectiveness -> #7 Anomaly Detection -> #8 Chargeback

**Phase 3 (Productivity insights):** #9 Heatmap -> #10 Efficiency Score -> #14 Export/Digest

**Phase 4 (Delivery tracking):** #11 Ticket/Sprint -> #12 Cache Optimizer -> #13 Thinking Tokens

**Phase 5 (Delight):** #15 Tips Engine (depends on most other features being in place)

## Key Finding

The single highest-ROI action is wiring `projectedMonthlySpend()` to the UI -- it's already written, tested, and sitting unused in `derived-metrics.ts`. Every stakeholder wanted budget forecasting.
