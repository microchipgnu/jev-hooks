// Executed inside the isolated installed-package consumer by test-package.mjs.
import assert from "node:assert/strict";
import worker from "./react-dist/docs-snippets/worker.js";
import { POST } from "./react-dist/docs-snippets/next-route.js";
const token = "test-only-token";
const input = {
  state: { changePct: -4 },
  questions: {
    pressure: {
      type: "score",
      instructions: "Pressure?",
      criteria: ["Normal", "Elevated", "Severe"],
    },
  },
};
const request = (authenticated = true) =>
  new Request("https://example.test/api/jev", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
let calls = 0;
const env = {
  JEV_ENDPOINT_TOKEN: token,
  AI: {
    async run(model, payload) {
      calls++;
      assert.equal(model, "typesafe/jev");
      assert.deepEqual(payload, input);
      return {
        model: "jev-1.13.0",
        answers: { pressure: { type: "score", score: 2 } },
        usage: { input_tokens: 20, output_tokens: 0 },
      };
    },
  },
};
assert.equal((await worker.fetch(request(false), env)).status, 403);
assert.equal(calls, 0);
assert.deepEqual(await (await worker.fetch(request(), env)).json(), {
  answers: { pressure: { type: "score", score: 2 } },
});
assert.equal(calls, 1);
assert.equal(
  (await worker.fetch(new Request("https://example.test/missing"), env)).status,
  404,
);
process.env.JEV_ENDPOINT_TOKEN = token;
delete process.env.AI_GATEWAY_API_KEY;
assert.equal((await POST(request(false))).status, 403);
assert.equal((await POST(request())).status, 502); // Missing provider credentials, no leaked secret.
console.log(
  "PASS: documented Worker binding request and Next route authorization using installed package.",
);

const { createEndpoint } = await import(
  "./react-dist/skill-assets/endpoint.js"
);
const { createJevClient } = await import("jev-hooks/react");
const mockEndpoint = createEndpoint(
  (req) => req.headers.get("Authorization") === `Bearer ${token}`,
);
assert.equal((await mockEndpoint(request(false))).status, 403);
const client = createJevClient({
  endpoint: "https://example.test/api/jev",
  headers: { Authorization: `Bearer ${token}` },
  fetch: (url, init) => mockEndpoint(new Request(url, init)),
});
const result = await client.evaluate(input);
assert.equal(result.pressure.type, "score");
assert.equal(result.pressure.score, 1);
console.log(
  "PASS: skill frontend HTTP client → authorized backend endpoint → mock answer.",
);
