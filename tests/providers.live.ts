// Explicit opt-in only; not selected by Vitest. Missing credentials skip a provider.
import assert from "node:assert/strict";
import {
  CloudflareJevAdapter,
  VercelJevAdapter,
  run,
  useChoice,
  useNoul,
  useScore,
  formatTrace,
  type JudgmentAdapter,
} from "../src/index.js";

function Program() {
  const state = { text: "Please refund the duplicate charge today." };
  const intent = useChoice("intent", {
    state,
    question: "Intent?",
    options: { refund: "A refund", help: "Technical help" },
  });
  const urgent = useNoul("urgent", {
    state,
    question: "Is there time pressure?",
  });
  const severity = useScore("severity", {
    state,
    question: "Time pressure?",
    levels: ["None", "Some", "Immediate"],
  });
  return { intent, urgent, severity };
}
const providers: [string, () => JudgmentAdapter, boolean][] = [
  [
    "Cloudflare REST",
    () =>
      new CloudflareJevAdapter({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        apiToken: process.env.CLOUDFLARE_API_TOKEN!,
      }),
    Boolean(
      process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN,
    ),
  ],
  [
    "Vercel AI Gateway",
    () => new VercelJevAdapter(),
    Boolean(process.env.AI_GATEWAY_API_KEY),
  ],
];
for (const [name, adapter, enabled] of providers) {
  if (!enabled) {
    console.log(`SKIP: ${name} credentials missing.`);
    continue;
  }
  const execution = await run(Program, {
    input: {},
    adapter: adapter(),
    trace: true,
  });
  assert.equal(execution.trace.requests, 1);
  assert.equal(execution.result.intent.type, "choice");
  assert.equal(execution.result.urgent.type, "noul");
  assert.equal(execution.result.severity.type, "score");
  console.log(`PASS: ${name}\n${formatTrace(execution.trace)}`);
}
