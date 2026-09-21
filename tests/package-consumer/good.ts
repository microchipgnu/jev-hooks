import assert from "node:assert/strict";
import {
  run,
  replay,
  useChoice,
  useInput,
  useNoul,
  MockJudgmentAdapter,
  formatTrace,
} from "jev-hooks";
import { checkNativePrograms } from "jev-hooks/check";

function Program() {
  const message = useInput<string>("message");
  const intent = useChoice("intent", {
    state: { message },
    question: "Intent?",
    options: { refund: "Money back", support: "Help" },
  });
  const urgent = useNoul("urgent", { state: { message }, question: "Urgent?" });
  const choice: "refund" | "support" = intent.choice;
  // @ts-expect-error Choice keys must retain their literal union across package types.
  const invalid: "unavailable" = intent.choice;
  return { intent, urgent, choice };
}

const adapter = new MockJudgmentAdapter();
const execution = await run(Program, {
  input: { message: "Please help" },
  adapter,
  trace: true,
});
assert.equal(execution.result.choice, "refund");
assert.equal(adapter.calls.length, 1);
assert.equal(execution.trace.requests, 1);
assert.match(formatTrace(execution.trace), /intent, urgent/);
const repeated = await replay(
  Program,
  JSON.parse(JSON.stringify(execution.trace)),
);
assert.deepEqual(repeated.result, execution.result);
assert.equal(typeof checkNativePrograms, "function");
console.log("PASS: installed jev-hooks runs and replays without credentials.");
