import { describe, expect, it } from "vitest";
import {
  run,
  replay,
  useInput,
  useScore,
  useChoice,
  useNoul,
  MockJudgmentAdapter,
} from "../src/index.js";
describe("nameless program composition", () => {
  it("batches independent declarations, resolves reference inputs, and preserves replay", async () => {
    function Program() {
      const market = useInput("market");
      const pressure = useScore({
        state: market,
        question: "Pressure?",
        levels: ["Normal", "Severe"],
      });
      const urgency = useNoul({ state: market, question: "Urgent?" });
      const outlook = useChoice({
        state: { pressure, urgency },
        question: "Outlook?",
        options: { watch: "Watch", calm: "Calm" },
      });
      return { pressure, urgency, outlook };
    }
    const adapter = new MockJudgmentAdapter();
    const execution = await run(Program, {
      input: { market: { move: -4 } },
      adapter,
      trace: true,
    });
    expect(adapter.calls).toHaveLength(2);
    expect(Object.keys(adapter.calls[0]!.questions)).toHaveLength(2);
    expect(execution.result.outlook.choice).toBe("watch");
    expect(
      execution.trace.passes
        .flatMap((p) => p.judgments)
        .find((j) => j.type === "choice")?.dependencies,
    ).toHaveLength(2);
    const recorded = await replay(Program, execution.trace);
    expect(recorded.result).toEqual(execution.result);
  });
});
