import { MODEL_PRICING } from "@session-logger/config.js";

export function cacheHitRatio(cacheRead: number, input: number): number {
  const total = input + cacheRead;
  if (total === 0) return 0;
  return cacheRead / total;
}

export function thinkingRatio(thinking: number, output: number): number {
  if (output === 0) return 0;
  return thinking / output;
}

export function toolDensity(toolUses: number, messages: number): number {
  if (messages === 0) return 0;
  return toolUses / messages;
}

export function costPerMinute(costUsd: number, durationSeconds: number | null): number | null {
  if (!durationSeconds || durationSeconds === 0) return null;
  return costUsd / (durationSeconds / 60);
}

export function costPerToolUse(costUsd: number, toolUseCount: number): number | null {
  if (toolUseCount === 0) return null;
  return costUsd / toolUseCount;
}

function findPricing(model: string) {
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(prefix)) return pricing;
  }
  return null;
}

export function cacheSavingsUsd(cacheReadTokens: number, model: string): number {
  const pricing = findPricing(model);
  if (!pricing) return 0;
  return (cacheReadTokens * (pricing.input - pricing.cacheRead)) / 1_000_000;
}

export function projectedMonthlySpend(
  dailyCosts: { date: string; cost: number }[],
  now: Date = new Date()
): number | null {
  if (dailyCosts.length < 3) return null;
  const last7 = dailyCosts.slice(-7);
  const avgDaily = last7.reduce((s, d) => s + d.cost, 0) / last7.length;
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const actualSoFar = dailyCosts.reduce((s, d) => s + d.cost, 0);
  return actualSoFar + avgDaily * daysRemaining;
}
