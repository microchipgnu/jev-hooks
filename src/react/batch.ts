import type { JudgmentRequest } from "../adapters/adapter.js";
import type { RuntimeAnswer, RuntimeQuestion } from "../types.js";
import { prepareRequest, validateAnswers, type JevClient } from "./client.js";
import { jsonKey } from "./json.js";

type Answers = Readonly<Record<string, RuntimeAnswer>>;
export type BatchResponse<M = unknown> = {
  answers: Answers;
  metadata?: M;
  cached?: "none" | "server" | "coalesced";
};
export type JevBatchTrace<M = unknown> = {
  id: string;
  request: JudgmentRequest;
  at: number;
  durationMs: number;
  status: "pending" | "ready" | "error";
  cached: "none" | "browser" | "server" | "coalesced";
  result?: Answers;
  metadata?: M;
  error?: string;
  discarded: boolean;
  discardedJudgments: string[];
};
export type JevBatchSnapshot<M = unknown> = {
  traces: readonly JevBatchTrace<M>[];
  requests: number;
  cacheHits: number;
};
export type BatchingOptions = {
  batchWindowMs?: number;
  cacheTimeMs?: number;
  maxCacheEntries?: number;
  maxTraces?: number;
};
type Task = {
  request: JudgmentRequest;
  signal?: AbortSignal;
  reload: boolean;
  resolve: (answers: Answers) => void;
  reject: (error: unknown) => void;
};
/** One browser-safe batch/cache implementation, shared by the SDK and demos. */
export class BatchedJevClient<M = unknown> implements JevClient {
  private listeners = new Set<() => void>();
  private snapshot: JevBatchSnapshot<M> = {
    traces: [],
    requests: 0,
    cacheHits: 0,
  };
  private queues = new Map<string, Task[]>();
  private cache = new Map<
    string,
    { answer: RuntimeAnswer; expires: number; metadata?: M; version: number }
  >();
  private pending = new Map<
    string,
    {
      promise: Promise<BatchResponse<M>>;
      controller: AbortController;
      users: number;
      questions: Record<string, RuntimeQuestion>;
      version: number;
    }
  >();
  private sequence = 0;
  private batchWindowMs: number;
  private cacheTimeMs: number;
  private maxCacheEntries: number;
  private maxTraces: number;
  constructor(
    private transport: (
      request: JudgmentRequest,
      options: { signal: AbortSignal; cache: "default" | "reload" },
    ) => Promise<BatchResponse<M>>,
    options: BatchingOptions = {},
  ) {
    this.batchWindowMs = options.batchWindowMs ?? 12;
    this.cacheTimeMs = options.cacheTimeMs ?? 300_000;
    this.maxCacheEntries = options.maxCacheEntries ?? 512;
    this.maxTraces = options.maxTraces ?? 100;
    for (const value of [
      this.batchWindowMs,
      this.cacheTimeMs,
      this.maxCacheEntries,
      this.maxTraces,
    ])
      if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647)
        throw new TypeError(
          "Batch/cache limits must be nonnegative timer-safe integers.",
        );
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private emit(update: Partial<JevBatchSnapshot<M>>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((fn) => fn());
  }
  private trace(id: string, update: Partial<JevBatchTrace<M>>) {
    this.emit({
      traces: this.snapshot.traces.map((t) =>
        t.id === id ? { ...t, ...update } : t,
      ),
    });
  }
  private key(state: unknown, question: RuntimeQuestion) {
    // Hook identity and labels are not semantic input. Equivalent declarations reuse work.
    return jsonKey({ state, question });
  }
  evaluate = (
    value: JudgmentRequest,
    {
      signal,
      cache,
    }: { signal?: AbortSignal; cache?: "default" | "reload" } = {},
  ): Promise<Answers> => {
    signal?.throwIfAborted();
    const request = prepareRequest(value);
    if (Object.keys(request.questions).length > 32)
      return Promise.reject(
        new TypeError(
          "React batches support at most 32 questions per declaration.",
        ),
      );
    const base = jsonKey({ state: request.state, reload: cache === "reload" });
    let index = 0;
    let key = base;
    // Respect the standard endpoint's 32-question limit, including large component trees.
    while (true) {
      const queue = this.queues.get(key);
      if (!queue) break;
      const existing = Object.assign(
        {},
        ...queue.map((t) => t.request.questions),
      ) as Record<string, RuntimeQuestion>;
      const conflict = Object.entries(request.questions).some(
        ([id, q]) => existing[id] && jsonKey(existing[id]) !== jsonKey(q),
      );
      if (
        !conflict &&
        new Set([...Object.keys(existing), ...Object.keys(request.questions)])
          .size <= 32
      )
        break;
      key = `${base}:partition:${++index}`;
    }
    return this.enqueue(key, request, signal, cache === "reload");
  };
  private enqueue(
    key: string,
    request: JudgmentRequest,
    signal: AbortSignal | undefined,
    reload: boolean,
  ) {
    let queue = this.queues.get(key);
    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
      setTimeout(() => {
        this.queues.delete(key);
        void this.flush(queue!);
      }, this.batchWindowMs);
    }
    return new Promise<Answers>((resolve, reject) => {
      const aborted = () => reject(signal!.reason);
      signal?.addEventListener("abort", aborted, { once: true });
      queue!.push({
        request,
        signal,
        reload,
        resolve: (answers) => {
          signal?.removeEventListener("abort", aborted);
          if (!signal?.aborted) resolve(answers);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", aborted);
          reject(error);
        },
      });
      if (signal?.aborted) aborted();
    });
  }
  private async flush(queue: Task[]) {
    const tasks = queue.filter((t) => !t.signal?.aborted);
    if (!tasks.length) return;
    const request = prepareRequest({
      state: tasks[0]!.request.state,
      questions: Object.assign({}, ...tasks.map((t) => t.request.questions)),
    });
    const version = ++this.sequence;
    const trace: JevBatchTrace<M> = {
      id: `batch-${version}`,
      request,
      at: Date.now(),
      durationMs: 0,
      status: "pending",
      cached: "none",
      discarded: false,
      discardedJudgments: [],
    };
    this.emit({
      traces: [trace, ...this.snapshot.traces].slice(0, this.maxTraces),
    });
    const answers: Record<string, RuntimeAnswer> = {};
    const missing: Record<string, RuntimeQuestion> = {};
    const aliases = new Map<string, string>();
    const definitions = new Map<string, string>();
    let metadata: M | undefined;
    for (const [id, question] of Object.entries(request.questions)) {
      const key = this.key(request.state, question);
      const entry = this.cache.get(key);
      if (!tasks[0]!.reload && entry && entry.expires > Date.now()) {
        answers[id] = entry.answer;
        metadata = entry.metadata;
        this.cache.delete(key);
        this.cache.set(key, entry);
      } else {
        const same = definitions.get(key);
        if (same) aliases.set(id, same);
        else {
          missing[id] = question;
          definitions.set(key, id);
        }
        if (entry && entry.expires <= Date.now()) this.cache.delete(key);
      }
    }
    try {
      let cached: JevBatchTrace["cached"] = "browser";
      if (Object.keys(missing).length) {
        const batch = { state: request.state, questions: missing };
        const pendingKey = jsonKey({
          state: batch.state,
          definitions: Object.values(missing)
            .map((q) => jsonKey(q))
            .sort(),
          reload: tasks[0]!.reload,
        });
        let operation = this.pending.get(pendingKey);
        const coalesced = !!operation;
        if (!operation) {
          const controller = new AbortController();
          const entry = {
            controller,
            users: 0,
            questions: missing,
            version,
            promise: undefined! as Promise<BatchResponse<M>>,
          };
          entry.promise = Promise.resolve()
            .then(() =>
              this.transport(batch, {
                signal: controller.signal,
                cache: tasks[0]!.reload ? "reload" : "default",
              }),
            )
            .then((output) => ({
              ...output,
              answers: validateAnswers(output.answers, batch),
            }))
            .finally(() => {
              if (this.pending.get(pendingKey) === entry)
                this.pending.delete(pendingKey);
            });
          operation = entry;
          this.pending.set(pendingKey, entry);
          this.emit({ requests: this.snapshot.requests + 1 });
        }
        const shared = operation;
        const releases = tasks.map((task) => {
          shared.users++;
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            task.signal?.removeEventListener("abort", release);
            if (--shared.users === 0) {
              if (this.pending.get(pendingKey) === shared)
                this.pending.delete(pendingKey);
              shared.controller.abort(
                new DOMException("Jev batch cancelled.", "AbortError"),
              );
            }
          };
          task.signal?.addEventListener("abort", release, { once: true });
          if (task.signal?.aborted) release();
          return release;
        });
        let output: BatchResponse<M>;
        try {
          output = await shared.promise;
        } finally {
          releases.forEach((release) => release());
        }
        if (coalesced) {
          const byDefinition = new Map(
            Object.entries(shared.questions).map(([id, q]) => [
              jsonKey(q),
              output.answers[id]!,
            ]),
          );
          output = {
            ...output,
            answers: Object.fromEntries(
              Object.entries(missing).map(([id, q]) => [
                id,
                byDefinition.get(jsonKey(q))!,
              ]),
            ),
          };
        }
        cached = coalesced ? "coalesced" : (output.cached ?? "none");
        metadata = output.metadata;
        for (const [id, answer] of Object.entries(output.answers)) {
          answers[id] = answer;
          const key = this.key(request.state, missing[id]!);
          // A late refresh cannot replace a newer answer for the same evidence.
          if (
            this.cacheTimeMs &&
            this.maxCacheEntries &&
            (!this.cache.has(key) ||
              this.cache.get(key)!.version <= shared.version)
          )
            this.cache.set(key, {
              answer,
              expires: Date.now() + this.cacheTimeMs,
              metadata,
              version: shared.version,
            });
        }
        while (this.cache.size > this.maxCacheEntries)
          this.cache.delete(this.cache.keys().next().value!);
      }
      for (const [id, original] of aliases) answers[id] = answers[original]!;
      const result = validateAnswers(answers, request);
      this.emit({
        cacheHits: this.snapshot.cacheHits + (cached !== "none" ? 1 : 0),
      });
      this.trace(trace.id, {
        status: "ready",
        result,
        cached,
        metadata,
        durationMs: Date.now() - trace.at,
        discarded: tasks.every((t) => t.signal?.aborted),
        discardedJudgments: [
          ...new Set(
            tasks
              .filter((t) => t.signal?.aborted)
              .flatMap((t) => Object.keys(t.request.questions)),
          ),
        ],
      });
      for (const task of tasks)
        task.resolve(
          validateAnswers(
            Object.fromEntries(
              Object.keys(task.request.questions).map((id) => [id, result[id]]),
            ),
            task.request,
          ),
        );
    } catch (error) {
      this.trace(trace.id, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - trace.at,
        discarded: tasks.every((t) => t.signal?.aborted),
        discardedJudgments: [
          ...new Set(
            tasks
              .filter((t) => t.signal?.aborted)
              .flatMap((t) => Object.keys(t.request.questions)),
          ),
        ],
      });
      tasks.forEach((t) => t.reject(error));
    }
  }
}
