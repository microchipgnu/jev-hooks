import { describe, expect, it } from "vitest";
import { MockJudgmentAdapter, run } from "../src/index.js";
import { SupportChat, type ChatMessage } from "../examples/chat-program.js";

function answers(choice: string, noul = 0.2) {
  return new MockJudgmentAdapter(() => ({
    intent: { type: "choice", choice },
    details: { type: "noul", noul },
  }));
}

describe("hooks support chat", () => {
  it("batches both judgments and asks for missing details", async () => {
    const adapter = answers("refund");
    const execution = await run(SupportChat, {
      input: { messages: [{ role: "user", content: "I want a refund" }] },
      adapter,
      trace: true,
    });
    expect(adapter.calls).toHaveLength(1);
    expect(Object.keys(adapter.calls[0]!.questions)).toEqual([
      "intent",
      "details",
    ]);
    expect(execution.trace.passes).toHaveLength(2);
    expect(execution.result.reply).toContain("What's the reason");
    expect(execution.result.details.noul).toBe(0.2);
  });

  it("passes conversation history into judgments for follow-ups", async () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "I want a refund" },
      { role: "assistant", content: "What's the reason?" },
      { role: "user", content: "I was charged twice" },
    ];
    const adapter = answers("refund", 0.95);
    const result = await run(SupportChat, { input: { messages }, adapter });
    expect(adapter.calls[0]!.state).toEqual({ messages });
    expect(result.reply).toContain("I can't access payments or issue refunds");
    expect(messages).toHaveLength(3);
  });

  it.each([
    ["greeting", 0.1, "Hi!"],
    ["support", 0.2, "What were you trying to do"],
    ["support", 0.95, "steps that reproduce it"],
    ["status", 0.9, "I can't look up accounts"],
    ["thanks", 0.1, "You're welcome"],
    ["other", 0.1, "not a general-purpose chatbot"],
  ])("selects an honest %s reply", async (intent, probability, expected) => {
    const result = await run(SupportChat, {
      input: { messages: [{ role: "user", content: "Example input" }] },
      adapter: answers(intent, probability),
    });
    expect(result.reply).toContain(expected);
  });
});
