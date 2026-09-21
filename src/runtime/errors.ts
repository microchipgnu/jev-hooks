import type { ExecutionTrace } from "../trace/types.js";
import type { JudgmentDependency } from "../types.js";
export class NativeRuntimeError extends Error {
  trace?: ExecutionTrace;
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NativeRuntimeError";
  }
}
export class PendingRead extends Error {
  constructor(readonly judgmentId: string) {
    super(
      `Judgment "${judgmentId}" is pending; its answer cannot be read during this pass.`,
    );
    this.name = "PendingRead";
  }
}
export class NoProgressError extends NativeRuntimeError {
  constructor(
    readonly pass: number,
    readonly pending: readonly string[],
    readonly waitingOn?: string,
    readonly dependencies: readonly JudgmentDependency[] = [],
  ) {
    super(
      `No progress in pass ${pass}; unresolved judgments: ${pending.join(", ") || "none"}${waitingOn ? `; evaluation was waiting on "${waitingOn}"` : ""}`,
      "NO_PROGRESS",
    );
    this.name = "NoProgressError";
  }
}
export class MaxPassesExceededError extends NativeRuntimeError {
  constructor(readonly maxPasses: number) {
    super(`Maximum pass count (${maxPasses}) exceeded.`, "MAX_PASSES");
    this.name = "MaxPassesExceededError";
  }
}
