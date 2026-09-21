/** Published Jev input price, verified 2026-09-20 at https://docs.typesafe.ai/models. */
export const inputUsdPerMillion = 0.042;
export const pricingSource = "https://docs.typesafe.ai/models";

export type DemoUsage = {
  since: number;
  requests: number;
  inferenceCalls: number;
  cacheHits: number;
  coalescedRequests: number;
  meteredCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};
