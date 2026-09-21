import { describe, expect, expectTypeOf, it } from "vitest";
import {
  MockJudgmentAdapter,
  NativeRuntimeError,
  PendingRead,
  formatTrace,
  run,
  useChoice,
  useInput,
  useNoul,
  useScore,
} from "../src/index.js";

describe("Jev-native hooks runtime", () => {
  it("batches independent judgments with identical state", async () => {
    function Program() {
      const ticket = useInput<string>("ticket");
      const intent = useChoice("intent", {
        state: { ticket },
        question: "intent?",
        options: { refund: "refund", support: "support" },
      });
      const urgent = useNoul("urgent", {
        state: { ticket },
        question: "urgent?",
      });
      return { intent, urgent };
    }
    const adapter = new MockJudgmentAdapter();
    const execution = await run(Program, {
      input: { ticket: "help" },
      adapter,
      trace: true,
    });
    expect(adapter.calls).toHaveLength(1);
    expect(Object.keys(adapter.calls[0]!.questions)).toEqual([
      "intent",
      "urgent",
    ]);
    expect(execution.result.intent.choice).toBe("refund");
    expect(execution.trace.passes).toHaveLength(2);
    expect(formatTrace(execution.trace)).toContain(
      "JEV BATCH [intent, urgent]",
    );
  });
  it("defers dependencies until a resolved answer is available", async () => {
    function Program() {
      const ticket = useInput<string>("ticket");
      const intent = useChoice("intent", {
        state: { ticket },
        question: "intent?",
        options: { refund: "refund", support: "support" },
      });
      const severity = useScore("severity", {
        state: { ticket, intent: intent.choice },
        question: "severity?",
        levels: ["low", "mid", "high"],
      });
      return { intent, severity };
    }
    const adapter = new MockJudgmentAdapter();
    await run(Program, { input: { ticket: "help" }, adapter });
    expect(adapter.calls).toHaveLength(2);
    expect(Object.keys(adapter.calls[0]!.questions)).toEqual(["intent"]);
    expect(adapter.calls[1]!.state).toMatchObject({ intent: "refund" });
  });
  it("batches all three primitives", async () => {
    function Program() {
      const x = useInput<string>("x");
      return {
        a: useChoice("a", {
          state: { x },
          question: "a",
          options: { yes: "yes", no: "no" },
        }),
        b: useNoul("b", { state: { x }, question: "b" }),
        c: useScore("c", { state: { x }, question: "c", levels: ["l", "h"] }),
      };
    }
    const adapter = new MockJudgmentAdapter();
    await run(Program, { input: { x: "x" }, adapter });
    expect(adapter.calls).toHaveLength(1);
  });
  it("does not batch different state", async () => {
    function Program() {
      const x = useInput<string>("x");
      return {
        a: useNoul("a", { state: { x }, question: "a" }),
        b: useNoul("b", { state: { x, policy: "strict" }, question: "b" }),
      };
    }
    const adapter = new MockJudgmentAdapter();
    await run(Program, { input: { x: "x" }, adapter });
    expect(adapter.calls).toHaveLength(2);
  });
  it("composes normal custom hooks", async () => {
    function useUnderstanding(ticket: string) {
      return {
        intent: useChoice("intent", {
          state: { ticket },
          question: "intent",
          options: { help: "help", refund: "refund" },
        }),
        urgent: useNoul("urgent", { state: { ticket }, question: "urgent" }),
      };
    }
    function Program() {
      return useUnderstanding(useInput<string>("ticket"));
    }
    const adapter = new MockJudgmentAdapter();
    await run(Program, { input: { ticket: "hello" }, adapter });
    expect(adapter.calls).toHaveLength(1);
  });
  it("does not allow unresolved fields to silently drive control flow", async () => {
    function Program() {
      const x = useInput<string>("x");
      const intent = useChoice("intent", {
        state: { x },
        question: "intent",
        options: { yes: "yes", no: "no" },
      });
      if (intent.choice === "yes") return "yes";
      return "no";
    }
    const adapter = new MockJudgmentAdapter();
    await expect(run(Program, { input: { x: "x" }, adapter })).resolves.toBe(
      "yes",
    );
    expect(adapter.calls).toHaveLength(1);
  });
  it("rejects duplicate incompatible IDs", async () => {
    function Program() {
      const x = useInput<string>("x");
      useNoul("same", { state: { x }, question: "one" });
      useNoul("same", { state: { x }, question: "two" });
      return null;
    }
    await expect(
      run(Program, { input: { x: "x" }, adapter: new MockJudgmentAdapter() }),
    ).rejects.toMatchObject({ code: "DUPLICATE_JUDGMENT" });
  });
  it("uses stable state fingerprints irrespective of insertion order", async () => {
    function Program() {
      const x = useInput<string>("x");
      const first = { a: x, b: 1 };
      const second = { b: 1, a: x };
      return {
        a: useNoul("a", { state: first, question: "a" }),
        b: useNoul("b", { state: second, question: "b" }),
      };
    }
    const adapter = new MockJudgmentAdapter();
    await run(Program, { input: { x: "x" }, adapter });
    expect(adapter.calls).toHaveLength(1);
  });
  it("annotates adapter failures", async () => {
    const adapter = new MockJudgmentAdapter(() => {
      throw new Error("network down");
    });
    function Program() {
      const x = useInput<string>("x");
      return useNoul("risk", { state: { x }, question: "risk" });
    }
    await expect(
      run(Program, { input: { x: "x" }, adapter }),
    ).rejects.toMatchObject({ code: "ADAPTER_FAILURE" });
  });
  it("reports no-progress when evaluation suspends without a declared judgment", async () => {
    function Program(): never {
      throw new PendingRead("missing");
    }
    await expect(
      run(Program, { input: {}, adapter: new MockJudgmentAdapter() }),
    ).rejects.toMatchObject({ code: "NO_PROGRESS", pending: ["missing"] });
  });
  it("reports missing input and invalid state clearly", async () => {
    expect(() => useInput("outside")).toThrow(NativeRuntimeError);
    function Program() {
      const x = useInput<string>("x");
      return useNoul("a", {
        state: { x, bad: undefined as unknown as string },
        question: "a",
      });
    }
    await expect(
      run(Program, { input: { x: "x" }, adapter: new MockJudgmentAdapter() }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("type inference", () => {
  it("retains choice option labels", () => {
    function Program() {
      const x = useInput<string>("x");
      const answer = useChoice("intent", {
        state: { x },
        question: "intent",
        options: { refund: "refund", support: "support" },
      });
      expectTypeOf(answer.choice).toEqualTypeOf<"refund" | "support">();
      return answer;
    }
    expectTypeOf(Program).toBeFunction();
  });
  it("retains SDK Score legend literals", () => {
    function Program() {
      const answer = useScore("score", {
        state: "x",
        question: "score?",
        levels: ["Low", "High"],
      });
      expectTypeOf(answer.legend?.["0"]).toEqualTypeOf<"Low" | undefined>();
      return answer;
    }
    expectTypeOf(Program).toBeFunction();
  });
});
