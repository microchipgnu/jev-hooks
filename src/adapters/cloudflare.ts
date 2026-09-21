import { snapshot } from "../runtime/fingerprint.js";
import { requestSchema } from "../transport/http.js";
import type {
  EvaluationContext,
  JudgmentAdapter,
  JudgmentRequest,
} from "./adapter.js";
import { decodeResponse } from "./response.js";

/** Structural interface compatible with a Workers AI binding; no Cloudflare dependency. */
export interface CloudflareAiBinding {
  run(model: "typesafe/jev", input: JudgmentRequest): Promise<unknown>;
}
type CommonOptions = {
  /** Optional exact response-model pin (Cloudflare may return a versioned Jev name). */
  readonly expectedResponseModel?: string;
};
export type CloudflareJevOptions = CommonOptions &
  (
    | {
        readonly ai: CloudflareAiBinding;
        readonly accountId?: never;
        readonly apiToken?: never;
        readonly fetch?: never;
        readonly signal?: never;
        readonly timeoutMs?: never;
      }
    | {
        readonly ai?: never;
        readonly accountId: string;
        readonly apiToken: string;
        readonly fetch?: typeof fetch;
        readonly signal?: AbortSignal;
        readonly timeoutMs?: number;
      }
  );

/** Cloudflare AI binding in Workers, or the documented account REST endpoint. */
export class CloudflareJevAdapter implements JudgmentAdapter {
  private readonly options: CloudflareJevOptions;
  constructor(options: CloudflareJevOptions) {
    if (options.ai) {
      if (typeof options.ai.run !== "function")
        throw new TypeError("Cloudflare ai must expose run().");
    } else {
      if (
        !/^[a-zA-Z0-9_-]+$/.test(options.accountId) ||
        !options.apiToken?.trim()
      ) {
        throw new TypeError("Cloudflare requires an accountId and apiToken.");
      }
      if (
        !Number.isSafeInteger(options.timeoutMs ?? 20_000) ||
        (options.timeoutMs ?? 20_000) < 1
      ) {
        throw new TypeError("Cloudflare timeoutMs must be a positive integer.");
      }
    }
    this.options = { ...options };
  }
  async evaluate(request: JudgmentRequest, context?: EvaluationContext) {
    const options = this.options;
    // Validate the shared question/state contract before invoking either transport.
    requestSchema.parse({ ...request, model: "typesafe/jev-1.13" });
    const input = snapshot(request);
    let raw: unknown;
    if (options.ai) {
      raw = await options.ai.run("typesafe/jev", input);
    } else {
      const body = JSON.stringify({ model: "typesafe/jev", input });
      if (new TextEncoder().encode(body).length > 200_000)
        throw new Error("Cloudflare request exceeds 200KB.");
      const signal = AbortSignal.any([
        ...(options.signal ? [options.signal] : []),
        AbortSignal.timeout(options.timeoutMs ?? 20_000),
      ]);
      signal.throwIfAborted();
      const response = await (options.fetch ?? globalThis.fetch)(
        `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai/run`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiToken}`,
            "Content-Type": "application/json",
          },
          body,
          signal,
          redirect: "error",
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          `Cloudflare Jev request failed (HTTP ${response.status}).`,
        );
      }
      // Bound response allocation before decoding JSON.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty Cloudflare response.");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1_000_000)
            throw new Error("Cloudflare response exceeds 1MB.");
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel();
        throw error;
      } finally {
        reader.releaseLock();
      }
      const data = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
      raw = JSON.parse(new TextDecoder().decode(data));
      // Cloudflare REST may wrap the documented model response in its API envelope.
      if (raw && typeof raw === "object" && "success" in raw) {
        if (raw.success !== true || !("result" in raw))
          throw new Error("Cloudflare reported an unsuccessful inference.");
        raw = raw.result;
      }
    }
    // Unified inference returns a completed-job envelope around the model output.
    if (raw && typeof raw === "object" && "state" in raw) {
      if (raw.state !== "Completed" || !("result" in raw))
        throw new Error("Cloudflare inference did not complete.");
      raw = raw.result;
    }
    return decodeResponse(
      raw,
      input,
      context,
      "Cloudflare",
      options.expectedResponseModel,
    );
  }
}
