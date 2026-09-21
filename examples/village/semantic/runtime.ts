// The village and world monitor share the same proven microbatch/cache implementation.
import {
  BatchedSemanticRuntime,
  type BatchTransport,
} from "../../shared/semantic-runtime.js";
import { dependencies, passFor, type ScopeKind } from "./contract.js";
import { mockSemantics } from "./mock.js";
export { fingerprint, liveTransport } from "../../shared/semantic-runtime.js";
export type {
  BatchTrace,
  BatchResult,
  BatchTransport,
  RuntimeSnapshot,
} from "../../shared/semantic-runtime.js";
export class SemanticRuntime extends BatchedSemanticRuntime {
  constructor(mode: "mock" | "live", transport?: BatchTransport) {
    super(
      mode,
      {
        mock: mockSemantics,
        endpoint: "/api/village",
        describe: (input) => ({
          dependencies: dependencies[input.kind as ScopeKind],
          pass: passFor[input.kind as ScopeKind],
        }),
      },
      transport,
    );
  }
}
