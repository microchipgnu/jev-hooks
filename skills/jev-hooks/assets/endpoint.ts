import { MockJudgmentAdapter } from "jev-hooks";
import { createJevHandler, type JevHandlerOptions } from "jev-hooks/server";

// Application helper, not an additional SDK export.
// Default answers are SIMULATED fixtures. Supply a server adapter for live Jev.
export function createEndpoint(
  authorize: JevHandlerOptions["authorize"],
  adapter: JevHandlerOptions["adapter"] = new MockJudgmentAdapter(),
) {
  return createJevHandler({ authorize, adapter });
}
