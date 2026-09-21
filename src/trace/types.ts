import type {
  JsonValue,
  RuntimeAnswer,
  RuntimeQuestion,
  JudgmentDependency,
} from "../types.js";
import type { ResponseMetadata } from "../adapters/adapter.js";
export type TraceJudgment = {
  id: string;
  type: RuntimeQuestion["type"];
  question: RuntimeQuestion;
  state: JsonValue;
  status: "ready" | "cached";
  fingerprint: string;
  dependencies: readonly JudgmentDependency[];
};
export type TraceBatch = {
  ids: string[];
  state: JsonValue;
  questions: Readonly<Record<string, RuntimeQuestion>>;
  requestFingerprint: string;
  startedAt: number;
  durationMs: number;
  answers?: Readonly<Record<string, RuntimeAnswer>>;
  answerFingerprint?: string;
  metadata?: ResponseMetadata;
  error?: string;
};
export type TracePass = {
  number: number;
  judgments: TraceJudgment[];
  batches: TraceBatch[];
  suspendedOn?: string;
  reads: {
    id: string;
    fingerprint: string;
    field: string;
    status: "pending" | "resolved";
  }[];
  durationMs: number;
};
export type ExecutionTrace = {
  version: 1;
  input: Readonly<Record<string, JsonValue>>;
  result?: JsonValue;
  executionFingerprint?: string;
  startedAt: number;
  durationMs: number;
  passes: TracePass[];
  requests: number;
  judgments: number;
  error?: string;
};
