import {
  run,
  replay,
  useInput,
  useChoice,
  useNoul,
  MockJudgmentAdapter,
  formatTrace,
} from "../src/index.js";

function Review() {
  const text = useInput<string>("text");
  const category = useChoice("category", {
    state: { text },
    question: "What does this message request?",
    options: { refund: "Money returned", support: "Help fixing something" },
  });
  const urgent = useNoul("urgent", {
    state: { text, category: category.choice },
    question: "Does this require prompt attention?",
  });
  return { category, urgent };
}

const original = await run(Review, {
  input: { text: "Please refund the duplicate charge today." },
  adapter: new MockJudgmentAdapter(),
  trace: true,
});
// This JSON can be saved to a file and loaded in another process.
const recording = JSON.stringify(original.trace);
const repeated = await replay(Review, JSON.parse(recording));
console.log(
  "Replay uses recorded answers: no adapter credentials or network required.",
);
console.log(formatTrace(repeated.trace));
console.log(
  "Identical execution fingerprint:",
  repeated.trace.executionFingerprint === original.trace.executionFingerprint,
);
