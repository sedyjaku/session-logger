---
name: session-tag
description: Tag the current Claude Code session with a label (e.g. Jira ticket). Usage /session-tag JIRA-123 or /session-tag to be prompted. Shows current labels if any exist.
user_invocable: true
arguments: "[label]"
---

# Session Tag

Tag the current session with a label for cost tracking.

## Instructions

Run: `npx tsx /Users/jakubsedy/Development/claude-customizations/session-loger/src/cli.ts label current <label>`

- If the user provided a label argument, use it directly
- If no label was provided, ask the user what label to assign
- After tagging, confirm the label was applied
- The status line will update automatically on the next response
