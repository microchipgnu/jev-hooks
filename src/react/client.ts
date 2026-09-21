import type { JudgmentAdapter, JudgmentRequest } from "../adapters/adapter.js";
import type { RuntimeAnswer } from "../types.js";
import { requestSchema, validateResponse } from "../transport/protocol.js";
import { readJson } from "../transport/read-json.js";
import { BatchedJevClient, type BatchingOptions } from "./batch.js";
import { freezeJson, jsonKey } from "./json.js";

type Answers = Readonly<Record<string, RuntimeAnswer>>;
export interface JevClient {
  evaluate(
    request: JudgmentRequest,
    options?: { signal?: AbortSignal; cache?: "default" | "reload" },
  ): Promise<Answers>;
}
export type JevClientOptions = {
  timeoutMs?: number;
  batching?: false | BatchingOptions;
} & (
  | {
      adapter: JudgmentAdapter;
      endpoint?: never;
      fetch?: never;
      headers?: never;
    }
  | {
      endpoint: string;
      adapter?: never;
      fetch?: typeof fetch;
      headers?: HeadersInit;
    }
);

export function prepareRequest(value: unknown): JudgmentRequest {
  const copy = JSON.parse(jsonKey(value)) as JudgmentRequest;
  const parsed = requestSchema.parse({ ...copy, model: "typesafe/jev-1.13" });
  return freezeJson({
    state: parsed.state,
    questions: parsed.questions,
  }) as JudgmentRequest;
}

export function validateAnswers(
  answers: unknown,
  request: JudgmentRequest,
): Answers {
  return freezeJson(
    validateResponse(
      {
        model: "runtime",
        answers,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      { ...request, model: "runtime" } as Parameters<
        typeof validateResponse
      >[1],
    ).answers,
  );
}

/** Browser-safe, client-local batching and bounded semantic cache. */
export function createJevClient(
  options: JevClientOptions & { batching: false },
): JevClient;
export function createJevClient(
  options: JevClientOptions & { batching?: BatchingOptions },
): BatchedJevClient;
export function createJevClient(options: JevClientOptions): JevClient;
export function createJevClient(options: JevClientOptions): JevClient {
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  )
    throw new TypeError("timeoutMs must be a positive timer-safe integer.");
  if (!options.adapter && !options.endpoint?.trim())
    throw new TypeError("Provide an adapter or endpoint.");
  type Entry = {
    promise: Promise<Answers>;
    controller: AbortController;
    users: number;
    settled: boolean;
  };
  const pending = new Map<string, Entry>();

  const transport: JevClient = {
    async evaluate(value, { signal } = {}) {
      signal?.throwIfAborted();
      const request = prepareRequest(value);
      const key = jsonKey(request);
      let entry = pending.get(key);
      if (!entry) {
        const controller = new AbortController();
        const current: Entry = {
          controller,
          users: 0,
          settled: false,
          promise: undefined!,
        };
        const timeout = setTimeout(
          () =>
            controller.abort(
              new DOMException("Jev request timed out.", "TimeoutError"),
            ),
          timeoutMs,
        );
        const perform = async () => {
          controller.signal.throwIfAborted();
          let answers: unknown;
          if (options.adapter) {
            answers = await options.adapter.evaluate(request, {
              onResponse() {},
              signal: controller.signal,
            });
          } else {
            const body = JSON.stringify(request);
            if (new TextEncoder().encode(body).length > 200_000)
              throw new Error("Jev request exceeds 200KB.");
            const headers = new Headers(options.headers);
            headers.set("Content-Type", "application/json");
            const response = await (options.fetch ?? globalThis.fetch)(
              options.endpoint,
              {
                method: "POST",
                headers,
                body,
                signal: controller.signal,
                credentials: "same-origin",
                redirect: "error",
              },
            );
            if (!response.ok) {
              await response.body?.cancel();
              throw new Error(`Jev endpoint failed (HTTP ${response.status}).`);
            }
            const decoded = await readJson(response.body, 1_000_000);
            answers =
              decoded && typeof decoded === "object" && "answers" in decoded
                ? decoded.answers
                : undefined;
          }
          controller.signal.throwIfAborted();
          return validateAnswers(answers, request);
        };
        // Also settle on cancellation when an adapter ignores its signal.
        current.promise = new Promise<Answers>((resolve, reject) => {
          const aborted = () => reject(controller.signal.reason);
          controller.signal.addEventListener("abort", aborted, { once: true });
          Promise.resolve()
            .then(perform)
            .then(resolve, reject)
            .finally(() => {
              controller.signal.removeEventListener("abort", aborted);
            });
        }).finally(() => {
          clearTimeout(timeout);
          current.settled = true;
          if (pending.get(key) === current) pending.delete(key);
        });
        pending.set(key, current);
        entry = current;
      }
      const shared = entry;
      shared.users++;
      return new Promise<Answers>((resolve, reject) => {
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          signal?.removeEventListener("abort", aborted);
          if (--shared.users === 0 && !shared.settled) {
            if (pending.get(key) === shared) pending.delete(key);
            shared.controller.abort(
              new DOMException("Jev request cancelled.", "AbortError"),
            );
          }
        };
        const aborted = () => {
          release();
          reject(signal!.reason);
        };
        signal?.addEventListener("abort", aborted, { once: true });
        shared.promise.then(
          (answers) => {
            release();
            resolve(answers);
          },
          (error) => {
            release();
            reject(error);
          },
        );
        if (signal?.aborted) aborted();
      });
    },
  };
  if (options.batching === false) return transport;
  return new BatchedJevClient(
    async (request, context) => ({
      answers: await transport.evaluate(request, context),
    }),
    options.batching,
  );
}
