import { Buffer } from "node:buffer";
import { setTimeout as delay } from "node:timers/promises";
import { abort, RuntimeError } from "./errors.js";
export const DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
import {
  requestSchema,
  responseSchema,
  validateResponse,
  type DecisionsRequest,
  type DecisionsResponse,
} from "./protocol.js";
export {
  requestSchema,
  validateResponse,
  type DecisionsRequest,
  type DecisionsResponse,
} from "./protocol.js";
export interface HttpOptions {
  apiKey: string;
  timeoutMs: number;
  retries: number;
  expectedResponseModel?: string;
  fetch?: typeof fetch;
  beforeAttempt: (attempt: number) => Promise<void>;
  onUsage?: (usage: DecisionsResponse["usage"]) => Promise<void>;
  record: (type: string, data: unknown) => Promise<void>;
}
export async function decide(
  body: DecisionsRequest,
  options: HttpOptions,
  signal: AbortSignal,
): Promise<DecisionsResponse> {
  const request = requestSchema.parse(body);
  if (Buffer.byteLength(JSON.stringify(request)) > 200_000)
    throw new RuntimeError(
      "blocked_inference",
      "Decision snapshot exceeds the 200KB request limit",
    );
  if (!options.apiKey)
    throw new RuntimeError(
      "blocked_inference",
      "Set OPENROUTER_API_KEY to enable Jev",
    );
  const fetcher = options.fetch ?? fetch;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    abort(signal);
    await options.beforeAttempt(attempt);
    const start = Date.now();
    await options.record("decision_request", {
      attempt,
      endpoint: DECISIONS_ENDPOINT,
      body: request,
    });
    let response: Response;
    try {
      response = await fetcher(DECISIONS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(options.timeoutMs),
        ]),
        redirect: "error",
      });
    } catch (e) {
      await options.record("decision_transport_error", {
        attempt,
        latencyMs: Date.now() - start,
        cost: "unknown",
      });
      abort(signal);
      if (attempt < options.retries) {
        await delay(100 * (attempt + 1), undefined, { signal });
        continue;
      }
      throw new RuntimeError(
        "blocked_inference",
        "Decisions transport failed or timed out; check connectivity/deadline",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      await options.record("decision_http_error", {
        attempt,
        status: response.status,
        latencyMs: Date.now() - start,
        cost: "unknown",
      });
      if (
        [408, 429, 500, 502, 503, 504, 524, 529].includes(response.status) &&
        attempt < options.retries
      ) {
        await delay(100 * (attempt + 1), undefined, { signal });
        continue;
      }
      const hint =
        response.status === 401
          ? "Check OPENROUTER_API_KEY"
          : response.status === 402
            ? "OpenRouter credits unavailable"
            : response.status === 404
              ? "Configured model or Decisions route unavailable"
              : "Decisions request rejected";
      throw new RuntimeError(
        "blocked_inference",
        `${hint} (HTTP ${response.status})`,
      );
    }
    // Limit bytes while streaming, rather than allocating an unbounded JSON body.
    const reader = response.body?.getReader();
    if (!reader)
      throw new RuntimeError("blocked_inference", "Empty Decisions response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1_000_000)
          throw new RuntimeError(
            "blocked_inference",
            "Decisions response exceeds size limit",
          );
        chunks.push(part.value);
      }
    } catch (e) {
      await reader.cancel();
      throw new RuntimeError(
        "blocked_inference",
        e instanceof Error ? e.message : "Response read failed",
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new RuntimeError(
        "blocked_inference",
        "Decisions returned invalid JSON",
      );
    }
    const received = responseSchema.safeParse(raw);
    if (received.success) {
      await options.record("decision_response_metadata", {
        attempt,
        model: received.data.model,
        provider: received.data.provider,
        usage: received.data.usage,
        latencyMs: Date.now() - start,
      });
      await options.onUsage?.(received.data.usage);
    }
    const result = validateResponse(
      raw,
      request,
      options.expectedResponseModel ?? request.model,
    );
    await options.record("decision_response", {
      attempt,
      response: result,
      latencyMs: Date.now() - start,
    });
    return result;
  }
  throw new RuntimeError("blocked_inference", "Retries exhausted");
}
