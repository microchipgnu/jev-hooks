// Explicit opt-in command; never selected by the ordinary Vitest suite.
import assert from "node:assert/strict";
import {
  run,
  useChoice,
  useNoul,
  useScore,
  formatTrace,
} from "../src/index.js";

if (!process.env.OPENROUTER_API_KEY) {
  console.log(
    "SKIP: set OPENROUTER_API_KEY in the shell or .env to run the live check.",
  );
} else {
  function Program() {
    const state = {
      ticket: "Please refund the duplicate charge. I need it resolved today.",
    };
    const intent = useChoice("intent", {
      state,
      question: "What is the customer asking for?",
      options: { refund: "Money returned", help: "Technical help" },
    });
    const urgent = useNoul("urgent", {
      state,
      question: "Is there explicit time pressure?",
    });
    const severity = useScore("severity", {
      state,
      question: "How much time pressure is expressed?",
      levels: ["None", "Some", "Immediate"],
    });
    return { intent, urgent, severity };
  }
  const { result, trace } = await run(Program, { input: {}, trace: true });
  assert.equal(trace.requests, 1);
  assert.equal(trace.passes.length, 2);
  assert.equal(result.intent.type, "choice");
  assert.ok(["refund", "help"].includes(result.intent.choice));
  assert.equal(result.urgent.type, "noul");
  assert.ok(result.urgent.noul >= 0 && result.urgent.noul <= 1);
  assert.equal(result.severity.type, "score");
  assert.ok(result.severity.score >= 0 && result.severity.score <= 2);
  assert.equal(
    trace.passes[0]?.batches[0]?.metadata?.model,
    "typesafe/jev-1.13-20260917",
  );
  console.log(formatTrace(trace));
  console.log("PASS: real OpenRouter Choice + Noul + Score in one request");
}
