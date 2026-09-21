import { types } from "node:util";
import {
  validateResponse,
  type DecisionsRequest,
} from "../transport/http.js";
import type { JudgmentAdapter } from "../adapters/adapter.js";
import { OpenRouterJevAdapter } from "../adapters/openrouter.js";
import type { JsonValue, Resolved, RuntimeAnswer } from "../types.js";
import type { ExecutionTrace, TraceBatch, TracePass } from "../trace/types.js";
import { executionFingerprint } from "../trace/fingerprint.js";
import { deepFreeze, fingerprint, snapshot } from "./fingerprint.js";
import {
  MaxPassesExceededError,
  NativeRuntimeError,
  NoProgressError,
  PendingRead,
} from "./errors.js";
import { EvaluationSession, withSession } from "./session.js";

export type NativeRunOptions = {
  readonly input: Readonly<Record<string, unknown>>;
  readonly adapter?: JudgmentAdapter;
  readonly maxPasses?: number;
  readonly trace?: boolean;
};
export type Execution<T> = {
  readonly result: Resolved<T>;
  readonly trace: ExecutionTrace;
};
export async function run<T>(
  program: () => T,
  options: NativeRunOptions & { readonly trace: true },
): Promise<Execution<T>>;
export async function run<T>(
  program: () => T,
  options: NativeRunOptions & { readonly trace?: false | undefined },
): Promise<Resolved<T>>;
export async function run<T>(
  program: () => T,
  options: NativeRunOptions,
): Promise<Resolved<T> | Execution<T>>;
export async function run<T>(
  program: () => T,
  options: NativeRunOptions,
): Promise<Resolved<T> | Execution<T>> {
  const startedAt = Date.now();
  const trace: ExecutionTrace = {
    version: 1,
    input: {},
    startedAt,
    durationMs: 0,
    passes: [],
    requests: 0,
    judgments: 0,
  };
  const cache = new Map<string, RuntimeAnswer>();
  const adapter = options.adapter ?? new OpenRouterJevAdapter();
  const maxPasses = options.maxPasses ?? 32;
  try {
    if (!Number.isSafeInteger(maxPasses) || maxPasses < 1)
      throw new NativeRuntimeError(
        "maxPasses must be a positive integer.",
        "INVALID_OPTIONS",
      );
    if (types.isAsyncFunction(program))
      throw new NativeRuntimeError(
        "Programs must be synchronous; async functions are not supported.",
        "ASYNC_PROGRAM",
      );
    if (
      !options.input ||
      typeof options.input !== "object" ||
      Array.isArray(options.input)
    )
      throw new NativeRuntimeError(
        "input must be a JSON object.",
        "INVALID_INPUT",
      );
    trace.input = snapshot(options.input, "input") as Record<string, JsonValue>;
    for (let number = 1; number <= maxPasses; number++) {
      const start = Date.now();
      const session = new EvaluationSession(trace.input, cache);
      const pass: TracePass = {
        number,
        judgments: [],
        reads: [],
        batches: [],
        durationMs: 0,
      };
      trace.passes.push(pass);
      let result: Resolved<T> | undefined;
      let complete = false;
      try {
        const output = withSession(session, program);
        if (types.isPromise(output)) {
          // Reject without leaving a rejected async program dangling.
          Promise.prototype.then.call(output, undefined, () => {});
          throw new NativeRuntimeError(
            "Programs must be synchronous; returning a Promise is not supported.",
            "ASYNC_PROGRAM",
          );
        }
        if (
          output &&
          typeof output === "object" &&
          !types.isProxy(output) &&
          typeof Object.getOwnPropertyDescriptor(output, "then")?.value ===
            "function"
        )
          throw new NativeRuntimeError(
            "Programs must be synchronous; returning a thenable is not supported.",
            "ASYNC_PROGRAM",
          );
        const ready = [...session.declarations.values()].some(
          (item) => !cache.has(item.fingerprint),
        );
        if (!ready) {
          result =
            output === undefined
              ? undefined
              : (snapshot(output, "result") as Resolved<T>);
          complete = true;
        }
      } catch (error) {
        if (!(error instanceof PendingRead)) throw error;
        session.suspendedOn = error.judgmentId;
      } finally {
        session.close();
        pass.judgments = [...session.declarations.values()].map((item) => ({
          id: item.id,
          type: item.question.type,
          question: item.question,
          state: item.state,
          status: cache.has(item.fingerprint) ? "cached" : "ready",
          fingerprint: item.fingerprint,
          dependencies: item.dependencies,
        }));
        pass.reads = session.reads;
        if (session.suspendedOn) pass.suspendedOn = session.suspendedOn;
        pass.durationMs = Date.now() - start;
        trace.judgments = new Set(
          trace.passes.flatMap((entry) =>
            entry.judgments.map((item) => item.id),
          ),
        ).size;
      }
      if (complete) {
        if (result !== undefined) trace.result = result as JsonValue;
        trace.durationMs = Date.now() - startedAt;
        trace.executionFingerprint = executionFingerprint(trace);
        deepFreeze(trace);
        return options.trace
          ? { result: result as Resolved<T>, trace }
          : (result as Resolved<T>);
      }
      const ready = [...session.declarations.values()].filter(
        (item) => !cache.has(item.fingerprint),
      );
      if (!ready.length)
        throw new NoProgressError(
          number,
          session.suspendedOn ? [session.suspendedOn] : [],
          session.suspendedOn,
          session.knownDependencies(),
        );
      const groups = new Map<string, typeof ready>();
      for (const item of ready) {
        const group = groups.get(item.stateFingerprint);
        if (group) group.push(item);
        else groups.set(item.stateFingerprint, [item]);
      }
      const outcomes = await Promise.allSettled(
        [...groups.values()].map(async (batch) => {
          const request = snapshot({
            state: batch[0]!.state,
            questions: Object.fromEntries(
              batch.map((item) => [item.id, item.question]),
            ),
          });
          const record: TraceBatch = {
            ids: batch.map((item) => item.id),
            ...request,
            requestFingerprint: fingerprint(request),
            startedAt: Date.now(),
            durationMs: 0,
          };
          pass.batches.push(record);
          trace.requests++;
          let acceptingMetadata = true;
          try {
            const raw = await adapter.evaluate(request, {
              onResponse: (metadata) => {
                if (acceptingMetadata)
                  record.metadata = snapshot(metadata, "responseMetadata");
              },
            });
            const answers = snapshot(raw, "answers");
            // Same validation for live, mock, third-party, and replay adapters.
            validateResponse(
              {
                model: "runtime",
                answers,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
              { ...request, model: "runtime" } as DecisionsRequest,
            );
            for (const item of batch)
              cache.set(item.fingerprint, answers[item.id]!);
            record.answers = answers;
            record.answerFingerprint = fingerprint(answers);
          } catch (error) {
            record.error =
              error instanceof Error ? error.message : String(error);
            throw new NativeRuntimeError(
              "Jev batch [" +
                record.ids.join(", ") +
                "] failed: " +
                record.error,
              "ADAPTER_FAILURE",
              error,
            );
          } finally {
            acceptingMetadata = false;
            record.durationMs = Date.now() - record.startedAt;
          }
        }),
      );
      pass.durationMs = Date.now() - start;
      const failure = outcomes.find((outcome) => outcome.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
    throw new MaxPassesExceededError(maxPasses);
  } catch (error) {
    trace.error = error instanceof Error ? error.message : String(error);
    trace.durationMs = Date.now() - startedAt;
    const failure =
      error instanceof NativeRuntimeError
        ? error
        : new NativeRuntimeError(trace.error, "PROGRAM_FAILURE", error);
    failure.trace = deepFreeze(trace);
    throw failure;
  }
}
