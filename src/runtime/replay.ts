import type { JudgmentAdapter } from "../adapters/adapter.js";
import { executionFingerprint } from "../trace/fingerprint.js";
import type { ExecutionTrace } from "../trace/types.js";
import { NativeRuntimeError } from "./errors.js";
import { fingerprint, snapshot } from "./fingerprint.js";
import { run, type Execution } from "./run.js";

/** Replay a completed trace by re-evaluating code with recorded answers, offline. */
export async function replay<T>(
  program: () => T,
  recording: ExecutionTrace,
): Promise<Execution<T>> {
  try {
    const trace = snapshot(recording, "recording");
    if (trace.version !== 1 || trace.error || !trace.executionFingerprint)
      throw mismatch("Replay requires a completed version-1 hooks trace.");
    if (executionFingerprint(trace) !== trace.executionFingerprint)
      throw mismatch(
        "The recording's execution fingerprint does not match its contents.",
      );
    const batches = trace.passes.flatMap((pass) => pass.batches);
    for (const batch of batches) {
      if (
        batch.error ||
        !batch.answers ||
        fingerprint({ state: batch.state, questions: batch.questions }) !==
          batch.requestFingerprint ||
        fingerprint(batch.answers) !== batch.answerFingerprint
      )
        throw mismatch(
          "Recorded batch [" +
            batch.ids.join(", ") +
            "] is incomplete or has been changed.",
        );
    }
    let index = 0;
    const adapter: JudgmentAdapter = {
      async evaluate(request, context) {
        const batch = batches[index++];
        if (!batch || fingerprint(request) !== batch.requestFingerprint)
          throw mismatch(
            "Request " + index + " differs from the recorded state/questions.",
          );
        if (batch.metadata) context?.onResponse(batch.metadata);
        return batch.answers!;
      },
    };
    const execution = await run(program, {
      input: trace.input,
      adapter,
      trace: true,
      // One extra evaluation lets a changed program fail with useful diagnostics.
      maxPasses: trace.passes.length + 1,
    });
    if (
      index !== batches.length ||
      execution.trace.executionFingerprint !== trace.executionFingerprint
    )
      throw mismatch(
        "Program declarations, dependencies, or result differ from the recording.",
      );
    return execution;
  } catch (error) {
    if (error instanceof NativeRuntimeError && error.code === "REPLAY_MISMATCH")
      throw error;
    const failure = new NativeRuntimeError(
      "Replay failed: " +
        (error instanceof Error ? error.message : String(error)),
      "REPLAY_MISMATCH",
      error,
    );
    if (error instanceof NativeRuntimeError && error.trace)
      failure.trace = error.trace;
    throw failure;
  }
}
function mismatch(message: string): NativeRuntimeError {
  return new NativeRuntimeError(message, "REPLAY_MISMATCH");
}
