import { createJevClient, type JevClient } from "../../src/react/client.js";
import { validateAnswers } from "../../src/react/client.js";
import { jsonKey } from "../../src/react/json.js";
import type { RuntimeAnswer } from "../../src/types.js";
import { readJson } from "../../src/transport/read-json.js";
import type { DemoUsage } from "../shared/usage.js";
import { atmosphereQuestions } from "../shared/atmosphere.js";

export class DemoRateLimitError extends Error {
  constructor(
    readonly retryAt: number,
    readonly scope: string = "unknown",
  ) {
    super("Demo limit reached. Please wait for the cooldown before retrying.");
    this.name = "DemoRateLimitError";
  }
}

/** Each hook subscribes to one full demo request, sharing its transport and cancellation. */
export function createAtmosphereClient(
  onRequest: () => void,
  transport: typeof fetch = fetch,
  onUsage?: (usage: DemoUsage) => void,
): JevClient {
  let limit: DemoRateLimitError | undefined;
  // Bounded session-memory cache: no localStorage persistence of visitors' text.
  const cache = new Map<
    string,
    { expires: number; answers: Readonly<Record<string, RuntimeAnswer>> }
  >();
  const shared = createJevClient({
    adapter: {
      async evaluate(request, context) {
        const key = jsonKey(request);
        const cached = cache.get(key);
        if (cached && cached.expires > Date.now()) {
          cache.delete(key);
          cache.set(key, cached);
          return cached.answers;
        }
        cache.delete(key);
        if (limit && Date.now() < limit.retryAt) throw limit;
        onRequest();
        const response = await transport("/api/atmosphere", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.state),
          signal: context?.signal,
          credentials: "same-origin",
          redirect: "error",
        });
        if (!response.ok) {
          if (response.status === 429) {
            const delay = Number(response.headers.get("Retry-After"));
            const seconds =
              Number.isFinite(delay) && delay > 0 ? Math.min(delay, 86400) : 60;
            const body = (await readJson(response.body, 4096).catch(
              () => null,
            )) as { scope?: unknown } | null;
            limit = new DemoRateLimitError(
              Date.now() + seconds * 1000,
              typeof body?.scope === "string" ? body.scope : "unknown",
            );
            throw limit;
          }
          await response.body?.cancel();
          throw new Error(
            "Live judgments are temporarily unavailable. Please try again later.",
          );
        }
        const body = (await readJson(response.body, 1_000_000)) as {
          answers?: unknown;
          usage?: DemoUsage;
        };
        const answers = validateAnswers(body?.answers, request);
        if (body.usage) onUsage?.(body.usage);
        cache.set(key, { answers, expires: Date.now() + 5 * 60_000 });
        if (cache.size > 100) cache.delete(cache.keys().next().value!);
        return answers;
      },
    },
  });
  return {
    async evaluate(request, options) {
      const answers = await shared.evaluate(
        { state: request.state, questions: atmosphereQuestions },
        options,
      );
      return validateAnswers(
        Object.fromEntries(
          Object.keys(request.questions).map((id) => [id, answers[id]]),
        ),
        request,
      );
    },
  };
}
