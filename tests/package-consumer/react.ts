import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createJevClient,
  JevProvider,
  MockJudgmentAdapter,
  useChoice,
  useNoul,
} from "jev-hooks/react";
import { createJevHandler } from "jev-hooks/server";
import assert from "node:assert/strict";

const adapter = new MockJudgmentAdapter();
function Component() {
  const result = useChoice({
    state: {},
    question: "Mood?",
    options: { calm: "Calm", playful: "Playful" },
  });
  const urgency = useNoul({ state: { mood: result }, question: "Urgent?" });
  assert.equal(urgency.semantic.status, "blocked");
  const choice: "calm" | "playful" | undefined = result.data?.choice;
  return createElement(
    "span",
    null,
    choice ?? (result.pending ? "pending" : "idle"),
  );
}
const html = renderToString(
  createElement(JevProvider, {
    client: createJevClient({ adapter }),
    children: createElement(Component),
  }),
);
assert(html.includes("pending"));
assert.equal(adapter.calls.length, 0);
const handler = createJevHandler({ adapter, authorize: () => true });
const response = await handler(
  new Request("https://example.test/", {
    method: "POST",
    body: JSON.stringify({
      state: {},
      questions: { test: { type: "noul", instructions: "Yes?" } },
    }),
  }),
);
assert.equal(response.status, 200);
console.log(
  "PASS: installed React types, SSR without inference, and server endpoint.",
);
