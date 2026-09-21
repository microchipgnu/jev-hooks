import { fingerprint } from "../runtime/fingerprint.js";
import type { ExecutionTrace } from "./types.js";

/** Only deterministic execution data; time and provider telemetry are not replay semantics. */
export function executionFingerprint(trace: ExecutionTrace): string {
  return fingerprint({
    version: trace.version,
    input: trace.input,
    result: trace.result ?? null,
    resultIsUndefined: !Object.hasOwn(trace, "result"),
    passes: trace.passes.map((pass) => ({
      judgments: pass.judgments,
      suspendedOn: pass.suspendedOn ?? null,
      reads: pass.reads,
      batches: pass.batches.map((batch) => ({
        request: batch.requestFingerprint,
        answers: batch.answerFingerprint ?? null,
      })),
    })),
  });
}
