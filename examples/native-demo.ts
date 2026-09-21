import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import {
  MockJudgmentAdapter,
  NativeRuntimeError,
  OpenRouterJevAdapter,
  formatTrace,
  run,
} from "../src/index.js";

/** Shared demo runner; credentials are loaded only for an explicit --live run. */
export async function demo<T>(
  program: () => T,
  input: Readonly<Record<string, unknown>>,
) {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((value) => value !== "--"),
    options: { live: { type: "boolean", default: false } },
  });
  if (values.live) {
    try {
      loadEnvFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  console.log(
    values.live
      ? "Live Jev via OpenRouter Decisions"
      : "Mock judgments (synthetic answers)",
  );
  try {
    const execution = await run(program, {
      input,
      adapter: values.live
        ? new OpenRouterJevAdapter()
        : new MockJudgmentAdapter(),
      trace: true,
    });
    console.log(JSON.stringify(execution.result, null, 2));
    console.log(formatTrace(execution.trace));
    return execution;
  } catch (error) {
    if (error instanceof NativeRuntimeError && error.trace)
      console.error(formatTrace(error.trace));
    throw error;
  }
}
