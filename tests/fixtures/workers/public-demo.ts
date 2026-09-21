import type { DurableObjectState } from "@cloudflare/workers-types";
import worker, {
  DemoBudget as Budget,
  type DemoEnv,
} from "../../../examples/demo-worker/index.js";
import type { JudgmentRequest } from "../../../src/adapters/adapter.js";

import { mockSemantics } from "../../../examples/village/semantic/mock.js";

import { mockMonitor } from "../../../examples/monitor/semantic/mock.js";
import { groups as monitorGroups } from "../../../examples/monitor/semantic/contract.js";

let calls = 0;
let lastRequest: JudgmentRequest | undefined;
const ai = {
  async run(_model: string, input: JudgmentRequest) {
    calls++;
    lastRequest = input;
    await new Promise((resolve) => setTimeout(resolve, 40));
    if ((input.state as { message: string }).message === "provider-error")
      throw new Error("secret provider diagnostic");
    return {
      state: "Completed",
      result: {
        model: "jev-1.13.0",
        answers:
          "kind" in (input.state as object)
            ? Object.hasOwn(
                monitorGroups,
                (input.state as { scopeId: string }).scopeId,
              )
              ? mockMonitor(input)
              : mockSemantics(input)
            : {
                mood: { type: "choice", choice: "calm" },
                motion: { type: "score", score: 1 },
                excitement: { type: "noul", noul: 0.25 },
              },
        usage: { input_tokens: 50, output_tokens: 25 },
      },
    };
  },
};

// These inspection endpoints exist only in the offline test fixture.
export class DemoBudget extends Budget {
  constructor(
    private testState: DurableObjectState,
    env: DemoEnv,
  ) {
    super(testState, { ...env, AI: ai });
  }
  override async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === "/stats") return Response.json({ calls, lastRequest });
    if (path === "/expire-cache") {
      this.testState.storage.sql.exec("UPDATE cache SET expires = 0");
      return new Response("ok");
    }
    if (path === "/expire-minute") {
      this.testState.storage.sql.exec(
        "UPDATE quotas SET expires = 0 WHERE key LIKE 'minute:%'",
      );
      return new Response("ok");
    }
    return super.fetch(request);
  }
}

export default {
  fetch(request: Request, env: DemoEnv) {
    return worker.fetch(request, {
      ...env,
      AI: ai,
      ASSETS: { fetch: async () => new Response("demo assets") },
    });
  },
};
