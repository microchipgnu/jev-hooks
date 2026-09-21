import { TypeSafeClient, type TypeSafeClientConfig } from "@typesafe-ai/sdk";
import { TypeSafeJevAdapter } from "./typesafe.js";

export type VercelJevOptions = {
  /** AI Gateway API key or an explicitly supplied Vercel OIDC token. */
  readonly apiKey?: string;
  readonly model?: string;
  readonly expectedResponseModel?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly fetch?: TypeSafeClientConfig["fetch"];
};

/** Official SDK routed through Vercel's TypeSafe-compatible AI Gateway API. */
export class VercelJevAdapter extends TypeSafeJevAdapter {
  constructor(options: VercelJevOptions = {}) {
    const apiKey =
      options.apiKey ??
      (typeof process !== "undefined"
        ? process.env.AI_GATEWAY_API_KEY
        : undefined);
    if (!apiKey?.trim())
      throw new Error(
        "Set AI_GATEWAY_API_KEY or pass apiKey to VercelJevAdapter.",
      );
    super(
      new TypeSafeClient({
        apiKey,
        baseURL: "https://ai-gateway.vercel.sh/typesafe",
        defaultModel: options.model ?? "typesafe-ai/jev",
        timeout: options.timeoutMs ?? 20_000,
        retry: { maxRetries: 0 },
        logLevel: "off",
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }),
      {
        signal: options.signal,
        provider: "Vercel AI Gateway",
        expectedResponseModel:
          options.expectedResponseModel ?? options.model ?? "typesafe-ai/jev",
      },
    );
  }
}
