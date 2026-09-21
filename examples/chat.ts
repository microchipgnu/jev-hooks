import { loadEnvFile } from "node:process";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import {
  MockJudgmentAdapter,
  NativeRuntimeError,
  OpenRouterJevAdapter,
  formatTrace,
  run,
} from "../src/index.js";
import { SupportChat, type ChatMessage } from "./chat-program.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    live: { type: "boolean", default: false },
    trace: { type: "boolean", default: false },
    prompt: { type: "string" },
  },
});
if (values.live) {
  try {
    loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "Set OPENROUTER_API_KEY in your environment or .env for live chat.",
    );
  }
}
const adapter = values.live
  ? new OpenRouterJevAdapter()
  : new MockJudgmentAdapter();
let messages: ChatMessage[] = [];
let showTrace = values.trace;

console.log(
  values.live
    ? "Support chat · live Jev via OpenRouter · one paid request per message"
    : "Support chat · MOCK: fixed synthetic judgments; messages are not interpreted",
);
console.log(
  "Replies are written in TypeScript, not generated. Recent history stays in memory; live mode sends it to the inference provider.",
);
console.log("Try: I want a refund. Commands: /trace, /clear, /exit.");

async function respond(content: string) {
  const input = [...messages, { role: "user" as const, content }];
  try {
    const execution = await run(SupportChat, {
      input: { messages: input },
      adapter,
      trace: true,
    });
    console.log(`Bot: ${execution.result.reply}`);
    if (showTrace) console.log(formatTrace(execution.trace));
    // Keep the last ten complete exchanges; no persistent conversation store.
    messages = [
      ...input,
      { role: "assistant" as const, content: execution.result.reply },
    ].slice(-20);
    return true;
  } catch (error) {
    console.error(
      `Chat failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (showTrace && error instanceof NativeRuntimeError && error.trace) {
      console.error(formatTrace(error.trace));
    }
    return false; // Failed turns do not become conversation history.
  }
}

if (values.prompt !== undefined) {
  if (!values.prompt.trim()) throw new Error("--prompt must not be empty.");
  console.log(`You: ${values.prompt}`);
  if (!(await respond(values.prompt.trim()))) process.exitCode = 1;
} else {
  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal,
  });
  lines.setPrompt("You: ");
  let closed = false;
  lines.on("close", () => {
    closed = true;
  });
  if (terminal) lines.prompt();
  try {
    for await (const line of lines) {
      const content = line.trim();
      if (content === "/exit") break;
      if (content === "/clear") {
        messages = [];
        console.log("Conversation cleared.");
      } else if (content === "/trace") {
        showTrace = !showTrace;
        console.log(`Trace ${showTrace ? "on" : "off"}.`);
      } else if (content) {
        if (!terminal) console.log(`You: ${content}`);
        if (!(await respond(content)) && !terminal) process.exitCode = 1;
      }
      if (terminal && !closed) lines.prompt();
    }
  } finally {
    lines.close();
  }
}
