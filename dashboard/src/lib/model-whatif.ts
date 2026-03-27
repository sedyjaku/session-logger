import type { SessionModelData } from "./queries-model-whatif";
import { MODEL_PRICING } from "@session-logger/config.js";

function findPricing(model: string) {
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(prefix)) return pricing;
  }
  return null;
}

export function repriceSession(
  session: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
  },
  targetModel: string
): number {
  const pricing = findPricing(targetModel);
  if (!pricing) return 0;
  return (
    (session.input_tokens * pricing.input +
      session.output_tokens * pricing.output +
      session.cache_creation_tokens * pricing.cacheCreation +
      session.cache_read_tokens * pricing.cacheRead) /
    1_000_000
  );
}

export interface SessionSavingsRow {
  session_id: string;
  project_path: string;
  model: string;
  actual_cost: number;
  if_sonnet: number;
  if_haiku: number;
  savings_sonnet: number;
  savings_haiku: number;
  thinking_tokens: number;
  message_count: number;
  tool_use_count: number;
  started_at: string;
}

export interface SavingsSummary {
  total_actual: number;
  total_if_sonnet: number;
  total_if_haiku: number;
  breakdown: SessionSavingsRow[];
}

export function computeSavings(sessions: SessionModelData[]): SavingsSummary {
  let totalActual = 0;
  let totalIfSonnet = 0;
  let totalIfHaiku = 0;
  const breakdown: SessionSavingsRow[] = [];

  for (const session of sessions) {
    const sonnetCost = repriceSession(session, "claude-sonnet-4-6");
    const haikuCost = repriceSession(session, "claude-haiku-4-5");

    totalActual += session.cost_usd;
    totalIfSonnet += sonnetCost;
    totalIfHaiku += haikuCost;

    if (session.model.startsWith("claude-opus-4")) {
      breakdown.push({
        session_id: session.session_id,
        project_path: session.project_path,
        model: session.model,
        actual_cost: session.cost_usd,
        if_sonnet: sonnetCost,
        if_haiku: haikuCost,
        savings_sonnet: session.cost_usd - sonnetCost,
        savings_haiku: session.cost_usd - haikuCost,
        thinking_tokens: session.thinking_tokens,
        message_count: session.message_count,
        tool_use_count: session.tool_use_count,
        started_at: session.started_at,
      });
    }
  }

  breakdown.sort((a, b) => b.savings_sonnet - a.savings_sonnet);

  return {
    total_actual: totalActual,
    total_if_sonnet: totalIfSonnet,
    total_if_haiku: totalIfHaiku,
    breakdown,
  };
}
