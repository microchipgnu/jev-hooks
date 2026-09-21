import {
  BatchedSemanticRuntime,
  type BatchTransport,
} from "../../shared/semantic-runtime.js";
import { groups, depth, normalizeMonitorInput } from "./contract.js";
import { mockMonitor } from "./mock.js";
export { fingerprint, liveTransport } from "../../shared/semantic-runtime.js";
export class MonitorRuntime extends BatchedSemanticRuntime {
  constructor(mode: "mock" | "live", transport?: BatchTransport) {
    super(
      mode,
      {
        mock: mockMonitor,
        normalizeInput: normalizeMonitorInput,
        endpoint: "/api/monitor",
        questions: (input) => groups[input.scopeId]!.questions,
        describe: (input) => ({
          dependencies: groups[input.scopeId]!.dependencies,
          pass: depth(groups[input.scopeId]!),
        }),
      },
      transport,
    );
  }
}
