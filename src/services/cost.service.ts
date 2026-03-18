import { MODEL_PRICING } from "../config.js";
import type { TokenUsage, CostBreakdown } from "../types.js";

function findPricing(model: string) {
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(prefix)) return pricing;
  }
  return null;
}

export function calculateCost(tokensByModel: TokenUsage[]): CostBreakdown {
  const breakdown: CostBreakdown = { totalCost: 0, unpricedModels: [], byModel: {} };

  for (const usage of tokensByModel) {
    const pricing = findPricing(usage.model);
    if (!pricing) {
      breakdown.unpricedModels.push(usage.model);
      breakdown.byModel[usage.model] = {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_tokens: usage.cache_creation_tokens,
        cache_read_tokens: usage.cache_read_tokens,
        cost: 0,
      };
      continue;
    }

    const cost =
      (usage.input_tokens / 1_000_000) * pricing.input +
      (usage.output_tokens / 1_000_000) * pricing.output +
      (usage.cache_creation_tokens / 1_000_000) * pricing.cacheCreation +
      (usage.cache_read_tokens / 1_000_000) * pricing.cacheRead;

    breakdown.byModel[usage.model] = {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_tokens: usage.cache_creation_tokens,
      cache_read_tokens: usage.cache_read_tokens,
      cost,
    };

    breakdown.totalCost += cost;
  }

  return breakdown;
}
