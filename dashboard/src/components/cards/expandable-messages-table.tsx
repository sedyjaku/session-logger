"use client";

import { useState } from "react";

interface Message {
  message_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function ExpandableMessagesTable({ messages }: { messages: Message[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? messages : messages.slice(0, 10);
  const hasMore = messages.length > 10;

  if (messages.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {expanded ? "All Messages" : "Costliest Messages"}
          <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
            {expanded ? `${messages.length} total` : `top 10 of ${messages.length}`}
          </span>
        </h3>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {expanded ? "Show top 10" : `Show all ${messages.length}`}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
              <th className="pb-3 pr-4 font-medium">#</th>
              <th className="pb-3 pr-4 font-medium">Model</th>
              <th className="pb-3 pr-4 text-right font-medium">Input Tokens</th>
              <th className="pb-3 pr-4 text-right font-medium">Output Tokens</th>
              <th className="pb-3 pr-4 text-right font-medium">Cache Read</th>
              <th className="pb-3 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m, idx) => (
              <tr
                key={m.message_id}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                  {idx + 1}
                </td>
                <td className="py-3 pr-4">{m.model}</td>
                <td className="py-3 pr-4 text-right">{formatTokens(m.input_tokens)}</td>
                <td className="py-3 pr-4 text-right">{formatTokens(m.output_tokens)}</td>
                <td className="py-3 pr-4 text-right">{formatTokens(m.cache_read_tokens)}</td>
                <td className="py-3 text-right font-medium">{formatCost(m.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && !expanded && (
        <div className="mt-3 text-center">
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-blue-500 hover:underline"
          >
            Show all {messages.length} messages
          </button>
        </div>
      )}
    </div>
  );
}
