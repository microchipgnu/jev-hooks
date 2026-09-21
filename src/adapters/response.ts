import { z } from "zod";
import { asJson } from "../runtime/fingerprint.js";
import { validateResponse, type DecisionsRequest } from "../transport/http.js";
import type { EvaluationContext, JudgmentRequest } from "./adapter.js";

// Provider envelopes can carry extra metadata; answer validation remains strict.
const envelope = z.object({
  model: z.string().min(1),
  answers: z.unknown(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cost: z.number().nonnegative().optional(),
  }),
  provider_metadata: z.unknown().optional(),
});

export function decodeResponse(
  raw: unknown,
  request: JudgmentRequest,
  context?: EvaluationContext,
  provider?: string,
  expectedModel?: string,
) {
  const value = envelope.parse(raw);
  // Preserve legitimate billing/routing metadata even when answers fail validation.
  context?.onResponse({
    model: value.model,
    ...(provider ? { provider } : {}),
    usage: value.usage,
    ...(value.provider_metadata === undefined
      ? {}
      : { providerMetadata: asJson(value.provider_metadata) }),
  });
  return validateResponse(
    { model: value.model, answers: value.answers, usage: value.usage },
    { ...request, model: expectedModel ?? value.model } as DecisionsRequest,
  ).answers;
}
