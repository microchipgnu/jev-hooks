import { decide, requestSchema, type HttpOptions } from "../transport/http.js";
import type { RuntimeAnswer } from "../types.js";
import type {
  EvaluationContext,
  JudgmentAdapter,
  JudgmentRequest,
} from "./adapter.js";

// Version pin retained from the verified source transport; callers may override it.
const DEFAULT_MODEL = "typesafe/jev-1.13";
const DEFAULT_RESPONSE_MODEL = "typesafe/jev-1.13-20260917";
export type OpenRouterJevOptions = Partial<HttpOptions> & {
  readonly model?: string;
  readonly signal?: AbortSignal;
};

/** Uses the package's validated Decisions transport, including its policy callbacks. */
export class OpenRouterJevAdapter implements JudgmentAdapter {
  private readonly options: OpenRouterJevOptions;
  constructor(options: OpenRouterJevOptions = {}) {
    this.options = { ...options };
  }

  async evaluate(
    request: JudgmentRequest,
    context?: EvaluationContext,
  ): Promise<Readonly<Record<string, RuntimeAnswer>>> {
    const options = this.options;
    const model = options.model ?? DEFAULT_MODEL;
    const body = requestSchema.parse({ ...request, model });
    const response = await decide(
      body,
      {
        apiKey:
          options.apiKey ??
          (typeof process !== "undefined"
            ? process.env.OPENROUTER_API_KEY
            : undefined) ??
          "",
        timeoutMs: options.timeoutMs ?? 20_000,
        retries: options.retries ?? 0,
        expectedResponseModel:
          options.expectedResponseModel ??
          (model === DEFAULT_MODEL ? DEFAULT_RESPONSE_MODEL : model),
        fetch: options.fetch,
        beforeAttempt: options.beforeAttempt ?? (async () => {}),
        record: async (type, data) => {
          // The transport reports usage before model-identity validation, so failed
          // billed responses remain inspectable too. No credential headers are recorded.
          if (type === "decision_response_metadata") {
            const metadata = data as {
              model: string;
              provider?: string;
              usage: {
                input_tokens: number;
                output_tokens: number;
                cost?: number;
              };
            };
            context?.onResponse({
              model: metadata.model,
              ...(metadata.provider === undefined
                ? {}
                : { provider: metadata.provider }),
              usage: metadata.usage,
            });
          }
          await options.record?.(type, data);
        },
        onUsage: options.onUsage,
      },
      options.signal ?? new AbortController().signal,
    );
    return response.answers;
  }
}
