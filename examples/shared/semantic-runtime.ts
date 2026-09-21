import {
  prepareRequest,
  validateAnswers,
  type JevClient,
} from "../../src/react/client.js";
import { BatchedJevClient } from "../../src/react/batch.js";
import { jsonKey } from "../../src/react/json.js";
import type { JudgmentRequest } from "../../src/adapters/adapter.js";
import type { RuntimeAnswer, RuntimeQuestion } from "../../src/types.js";
import { readJson } from "../../src/transport/read-json.js";
import { DemoRateLimitError } from "../react/live-client.js";
import type { DemoUsage } from "./usage.js";
import type { JsonValue } from "../../src/types.js";
export type SemanticInput = {
  kind: string;
  scopeId: string;
  [key: string]: JsonValue;
};
export type RuntimeDefinition = {
  normalizeInput?: (state: unknown) => SemanticInput;
  mock: (request: JudgmentRequest) => Answers;
  describe: (input: SemanticInput) => { dependencies: string[]; pass: number };
  endpoint: string;
  questions?: (input: SemanticInput) => Record<string, RuntimeQuestion>;
};

type Answers = Readonly<Record<string, RuntimeAnswer>>;
export type BatchTrace = {
  id: string;
  scopeId: string;
  kind: SemanticInput["kind"];
  dependencies: string[];
  stateFingerprint: string;
  inputState: SemanticInput;
  questions: Record<string, RuntimeQuestion>;
  result?: Answers;
  pass: number;
  generation: number;
  durationMs: number;
  cached: "none" | "browser" | "server" | "coalesced";
  source: "mock" | "jev";
  model: string;
  status: "pending" | "ready" | "error";
  error?: string;
  invalidated: string[];
  at: number;
  discarded: boolean;
  discardedJudgments: string[];
};
export type RuntimeSnapshot = {
  traces: readonly BatchTrace[];
  requests: number;
  cacheHits: number;
  usage?: DemoUsage;
};
export function fingerprint(value: unknown): string {
  // Display identifier only. Full canonical JSON, not this short hash, keys the cache.
  const text = jsonKey(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}
export type BatchResult = {
  answers: Answers;
  cached?: BatchTrace["cached"];
  model?: string;
  usage?: DemoUsage;
};
export type BatchTransport = (request: JudgmentRequest) => Promise<BatchResult>;
export function liveTransport(
  onUsage?: (usage: DemoUsage) => void,
  endpoint = "/api/village",
): BatchTransport {
  let limit: DemoRateLimitError | undefined;
  return async (request) => {
    if (limit && limit.retryAt > Date.now()) throw limit;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: request.state,
        ids: Object.keys(request.questions),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const body = (await readJson(response.body, 1_000_000)) as {
      answers?: Answers;
      model?: string;
      usage?: DemoUsage;
      error?: string;
      scope?: string;
    };
    if (response.status === 429) {
      const delay = Number(response.headers.get("Retry-After"));
      limit = new DemoRateLimitError(
        Date.now() +
          (Number.isFinite(delay) && delay > 0 ? Math.min(delay, 86400) : 60) *
            1000,
        body.scope,
      );
      throw limit;
    }
    if (!response.ok)
      throw new Error(
        body.error ??
          `Live Jev unavailable (${response.status}). Switch to Simulated to continue locally.`,
      );
    const answers = validateAnswers(body.answers, request);
    if (body.usage) onUsage?.(body.usage);
    const cache = response.headers.get("X-Jev-Cache");
    return {
      answers,
      model: body.model ?? "typesafe/jev",
      usage: body.usage,
      cached:
        cache === "HIT"
          ? "server"
          : cache === "COALESCED"
            ? "coalesced"
            : "none",
    };
  };
}

/** Demo-specific provenance and usage presentation over the SDK batch/cache. */
export class BatchedSemanticRuntime implements JevClient {
  readonly source: "mock" | "jev";
  private client: BatchedJevClient<{ model?: string; usage?: DemoUsage }>;
  private snapshot: RuntimeSnapshot = { traces: [], requests: 0, cacheHits: 0 };
  private listeners = new Set<() => void>();
  private generations = new Map<string, { key: string; value: number }>();
  private traceGenerations = new Map<
    string,
    { generation: number; changed: boolean }
  >();
  constructor(
    readonly mode: "mock" | "live",
    private definition: RuntimeDefinition,
    transport?: BatchTransport,
  ) {
    this.source = mode === "live" ? "jev" : "mock";
    const send: BatchTransport =
      transport ??
      (mode === "live"
        ? liveTransport(undefined, definition.endpoint)
        : async (request: JudgmentRequest) => {
            await new Promise((resolve) => setTimeout(resolve, 280));
            return {
              answers: definition.mock(request),
              model: "authored-fixtures-v1",
            };
          });
    this.client = new BatchedJevClient(async (request) => {
      const output = await send(request);
      return {
        answers: output.answers,
        cached: output.cached === "browser" ? undefined : output.cached,
        metadata: { model: output.model, usage: output.usage },
      };
    });
    this.client.subscribe(() => {
      const current = this.client.getSnapshot();
      const traces = current.traces.map((trace) => {
        const input = trace.request.state as SemanticInput;
        let gen = this.traceGenerations.get(trace.id);
        if (!gen) {
          const key = jsonKey(input),
            previous = this.generations.get(input.scopeId);
          const changed = !!previous && previous.key !== key;
          gen = {
            generation: (previous?.value ?? 0) + (changed || !previous ? 1 : 0),
            changed,
          };
          this.generations.set(input.scopeId, { key, value: gen.generation });
          this.traceGenerations.set(trace.id, gen);
        }
        return {
          ...trace,
          scopeId: input.scopeId,
          kind: input.kind,
          inputState: input,
          stateFingerprint: fingerprint(input),
          questions: trace.request.questions,
          ...definition.describe(input),
          generation: gen.generation,
          source: this.source,
          model:
            trace.metadata?.model ??
            (mode === "mock" ? "authored-fixtures-v1" : "typesafe/jev"),
          invalidated: gen.changed ? Object.keys(trace.request.questions) : [],
        } satisfies BatchTrace;
      });
      for (const id of this.traceGenerations.keys())
        if (!traces.some((t) => t.id === id)) this.traceGenerations.delete(id);
      this.snapshot = {
        traces,
        requests: current.requests,
        cacheHits: current.cacheHits,
        usage:
          traces.find((t) => t.metadata?.usage)?.metadata?.usage ??
          this.snapshot.usage,
      };
      this.listeners.forEach((fn) => fn());
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  evaluate = async (
    value: JudgmentRequest,
    options: { signal?: AbortSignal; cache?: "default" | "reload" } = {},
  ) => {
    const request = prepareRequest(
      this.definition.normalizeInput
        ? { ...value, state: this.definition.normalizeInput(value.state) }
        : value,
    );
    const definitions = this.definition.questions?.(
      request.state as SemanticInput,
    );
    // Public endpoint accepts audited question IDs. UI hook identities are private.
    const aliases = Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => {
        const match =
          definitions &&
          Object.entries(definitions).find(
            ([, definition]) => jsonKey(definition) === jsonKey(question),
          );
        if (definitions && !match)
          throw new Error("Question is not in the public demo contract.");
        return [id, match?.[0] ?? id];
      }),
    );
    const answers = await this.client.evaluate(
      {
        state: request.state,
        questions: Object.fromEntries(
          Object.entries(request.questions).map(([id, q]) => [aliases[id]!, q]),
        ),
      },
      options,
    );
    return validateAnswers(
      Object.fromEntries(
        Object.entries(aliases).map(([id, wireId]) => [id, answers[wireId]]),
      ),
      request,
    );
  };
}
