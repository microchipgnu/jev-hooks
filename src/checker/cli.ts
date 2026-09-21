#!/usr/bin/env node
import { parseArgs } from "node:util";

try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      project: { type: "string", short: "p", default: "tsconfig.json" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(
      "Usage: jev-check [--project tsconfig.json] [file.ts ...]\nRequires typescript@7.0.2 in the consuming project.",
    );
  } else {
    // Keep the optional compiler peer out of normal runtime imports.
    const { checkNativePrograms } = await import("./check.js");
    const diagnostics = checkNativePrograms(
      values.project,
      positionals.length ? positionals : undefined,
    );
    for (const item of diagnostics) {
      console.error(`${item.file}:${item.line}:${item.column} ${item.message}`);
    }
    if (diagnostics.length) process.exitCode = 1;
    else console.log("Jev program safety checks passed.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
    console.error(
      "Install the checker peer: npm install --save-dev typescript@7.0.2",
    );
  }
  process.exitCode = 1;
}
