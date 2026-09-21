"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  useCallback,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type {
  ChoiceAnswer,
  ChoiceConfig,
  ChoiceOptions,
  NoulAnswer,
  NoulConfig,
  ScoreAnswer,
  ScoreConfig,
  ScoreLevels,
  RuntimeAnswer,
  RuntimeQuestion,
} from "../types.js";
import { type JevClient, prepareRequest } from "./client.js";
import { jsonKey } from "./json.js";
import {
  reference,
  resolveSemanticState,
  type SemanticReference,
  type SemanticInfo,
} from "./reference.js";
export type {
  SemanticReference,
  SemanticInfo,
  SemanticDependency,
} from "./reference.js";

export { createJevClient } from "./client.js";
export type { JevClient, JevClientOptions } from "./client.js";
export { MockJudgmentAdapter } from "../adapters/mock.js";
export type { JudgmentAdapter, JudgmentRequest } from "../adapters/adapter.js";
export type { ChoiceAnswer, NoulAnswer, ScoreAnswer } from "../types.js";

const ClientContext = createContext<JevClient | null>(null);
export function JevProvider({
  client,
  children,
}: {
  client: JevClient;
  children: ReactNode;
}) {
  return createElement(ClientContext.Provider, { value: client }, children);
}

export type JudgmentOptions = {
  /** Inspector annotation only; never an identity or dependency key. */
  label?: string;
  client?: JevClient;
  enabled?: boolean;
  /** Trailing debounce. Defaults to 300 ms; 0 schedules after commit. */
  debounceMs?: number;
  keepPreviousData?: boolean;
};
export type JudgmentResult<T> = {
  readonly data: T | undefined;
  readonly pending: boolean;
  readonly error: Error | undefined;
  /** Data belongs to previous inputs, or a refresh is in progress. */
  readonly stale: boolean;
  readonly refetch: () => void;
};

export type SemanticResult<T> = JudgmentResult<T> & SemanticReference<T>;

function useJudgment<T extends RuntimeAnswer>(
  explicitId: string | undefined,
  state: unknown,
  question: RuntimeQuestion,
  options: JudgmentOptions,
): SemanticResult<T> {
  const automaticId = useId();
  const internalId = `jev${automaticId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const id = explicitId ?? internalId;
  const provided = useContext(ClientContext);
  const client = options.client ?? provided;
  if (!client)
    throw new Error(
      "Wrap React Jev hooks in JevProvider or pass a client option.",
    );
  if (!id.trim()) throw new TypeError("Jev judgment IDs must be nonempty.");
  const debounceMs = options.debounceMs ?? 300;
  if (
    !Number.isSafeInteger(debounceMs) ||
    debounceMs < 0 ||
    debounceMs > 2_147_483_647
  )
    throw new TypeError("debounceMs must be a nonnegative timer-safe integer.");
  const resolved = resolveSemanticState(state, client);
  const enabled = (options.enabled ?? true) && resolved.ready;
  // Structural equality avoids repeat calls for freshly allocated but equal props.
  const key = jsonKey(
    prepareRequest({
      state: !resolved.ready && resolved.input === null ? {} : resolved.input,
      questions: { [id]: question },
    }),
  );
  const [revision, setRevision] = useState(0);
  const consumedRefresh = useRef(0);
  type Outcome = {
    key: string;
    client: JevClient;
    revision: number;
    pending: boolean;
    data?: T;
    dataKey?: string;
    dataClient?: JevClient;
    error?: Error;
  };
  const [outcome, setOutcome] = useState<Outcome>();
  const refetch = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const identity = { key, client, revision };
    setOutcome((previous) => ({
      ...previous,
      ...identity,
      pending: true,
      error: undefined,
    }));
    const timer = setTimeout(() => {
      // Promise boundary also catches a custom client's synchronous error.
      Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          const refresh = consumedRefresh.current !== revision;
          consumedRefresh.current = revision;
          return client.evaluate(JSON.parse(key), {
            signal: controller.signal,
            cache: refresh ? "reload" : "default",
          });
        })
        .then(
          (answers) => {
            if (!controller.signal.aborted)
              setOutcome({
                ...identity,
                pending: false,
                data: answers[id] as T,
                dataKey: key,
                dataClient: client,
              });
          },
          (error) => {
            if (!controller.signal.aborted)
              setOutcome((previous) => ({
                ...previous,
                ...identity,
                pending: false,
                error:
                  error instanceof Error ? error : new Error(String(error)),
              }));
          },
        );
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [client, key, id, revision, enabled, debounceMs]);

  const matches =
    outcome?.key === key &&
    outcome.client === client &&
    outcome.revision === revision;
  const pending = enabled && (!matches || outcome.pending);
  const currentData = outcome?.dataKey === key && outcome.dataClient === client;
  const data =
    outcome?.dataClient === client &&
    ((options.keepPreviousData ?? true) || currentData)
      ? outcome?.data
      : undefined;
  const stale = data !== undefined && (!currentData || pending || !enabled);
  const error = resolved.error ?? (matches ? outcome.error : undefined);
  const status: SemanticInfo["status"] = !(options.enabled ?? true)
    ? "disabled"
    : !resolved.ready
      ? "blocked"
      : error
        ? "error"
        : pending
          ? "pending"
          : "ready";
  const dependencyKey = JSON.stringify(resolved.dependencies);
  return useMemo(
    () =>
      reference<T, JudgmentResult<T>>(
        {
          data,
          pending,
          error,
          stale,
          refetch,
        },
        {
          id: internalId,
          label: options.label ?? explicitId,
          input: resolved.input,
          dependencies: resolved.dependencies,
          pass: 1 + Math.max(0, ...resolved.dependencies.map((d) => d.pass)),
          status,
        },
        {
          ready: status === "ready" && data !== undefined && !stale,
          data,
          error,
          client,
        },
      ),
    [
      id,
      internalId,
      options.label,
      explicitId,
      key,
      dependencyKey,
      status,
      data,
      pending,
      error,
      stale,
      refetch,
      client,
    ],
  );
}

export function useChoice<const O extends ChoiceOptions>(
  config: ChoiceConfig<O>,
  options?: JudgmentOptions,
): SemanticResult<ChoiceAnswer<O>>;
/** @deprecated Names are optional. Prefer useChoice(config, options). */
export function useChoice<const O extends ChoiceOptions>(
  id: string,
  config: ChoiceConfig<O>,
  options?: JudgmentOptions,
): SemanticResult<ChoiceAnswer<O>>;
export function useChoice<const O extends ChoiceOptions>(
  idOrConfig: string | ChoiceConfig<O>,
  configOrOptions?: ChoiceConfig<O> | JudgmentOptions,
  legacyOptions?: JudgmentOptions,
): SemanticResult<ChoiceAnswer<O>> {
  const config = (
    typeof idOrConfig === "string" ? configOrOptions : idOrConfig
  ) as ChoiceConfig<O>;
  const options = (
    typeof idOrConfig === "string" ? legacyOptions : configOrOptions
  ) as JudgmentOptions | undefined;
  return useJudgment(
    typeof idOrConfig === "string" ? idOrConfig : undefined,
    config.state,
    { type: "choice", instructions: config.question, criteria: config.options },
    { ...options, label: options?.label ?? config.label },
  );
}
export function useNoul(
  config: NoulConfig,
  options?: JudgmentOptions,
): SemanticResult<NoulAnswer>;
/** @deprecated Names are optional. Prefer useNoul(config, options). */
export function useNoul(
  id: string,
  config: NoulConfig,
  options?: JudgmentOptions,
): SemanticResult<NoulAnswer>;
export function useNoul(
  idOrConfig: string | NoulConfig,
  configOrOptions?: NoulConfig | JudgmentOptions,
  legacyOptions?: JudgmentOptions,
): SemanticResult<NoulAnswer> {
  const config = (
    typeof idOrConfig === "string" ? configOrOptions : idOrConfig
  ) as NoulConfig;
  const options = (
    typeof idOrConfig === "string" ? legacyOptions : configOrOptions
  ) as JudgmentOptions | undefined;
  return useJudgment(
    typeof idOrConfig === "string" ? idOrConfig : undefined,
    config.state,
    { type: "noul", instructions: config.question },
    { ...options, label: options?.label ?? config.label },
  );
}
export function useScore<const L extends ScoreLevels>(
  config: ScoreConfig<L>,
  options?: JudgmentOptions,
): SemanticResult<ScoreAnswer<L>>;
/** @deprecated Names are optional. Prefer useScore(config, options). */
export function useScore<const L extends ScoreLevels>(
  id: string,
  config: ScoreConfig<L>,
  options?: JudgmentOptions,
): SemanticResult<ScoreAnswer<L>>;
export function useScore<const L extends ScoreLevels>(
  idOrConfig: string | ScoreConfig<L>,
  configOrOptions?: ScoreConfig<L> | JudgmentOptions,
  legacyOptions?: JudgmentOptions,
): SemanticResult<ScoreAnswer<L>> {
  const config = (
    typeof idOrConfig === "string" ? configOrOptions : idOrConfig
  ) as ScoreConfig<L>;
  const options = (
    typeof idOrConfig === "string" ? legacyOptions : configOrOptions
  ) as JudgmentOptions | undefined;
  return useJudgment(
    typeof idOrConfig === "string" ? idOrConfig : undefined,
    config.state,
    { type: "score", instructions: config.question, criteria: config.levels },
    { ...options, label: options?.label ?? config.label },
  );
}

export { SemanticScope, useAmbient } from "./semantic.js";

export { BatchedJevClient } from "./batch.js";
export type {
  BatchingOptions,
  BatchResponse,
  JevBatchTrace,
  JevBatchSnapshot,
} from "./batch.js";
