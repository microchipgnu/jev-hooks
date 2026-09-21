import type { ExecutionTrace } from "./types.js";
export function formatTrace(trace: ExecutionTrace): string {
  const lines = [
    `Jev Native trace: ${trace.passes.length} passes, ${trace.requests} System One requests, ${trace.judgments} judgments`,
  ];
  for (const pass of trace.passes) {
    lines.push(`\nPASS ${pass.number} (${pass.durationMs}ms)`);
    for (const judgment of pass.judgments) {
      lines.push(`  ${judgment.id}  ${judgment.type}  ${judgment.status}`);
      if (judgment.dependencies.length)
        lines.push(
          "    observed dependencies: " +
            judgment.dependencies
              .map((item) => item.id + " [" + item.fields.join(", ") + "]")
              .join("; "),
        );
    }
    if (pass.suspendedOn)
      lines.push(`  evaluation suspended waiting on: ${pass.suspendedOn}`);
    for (const batch of pass.batches) {
      lines.push(
        `  JEV BATCH [${batch.ids.join(", ")}] (${batch.durationMs}ms)${batch.error ? ` ERROR: ${batch.error}` : ""}`,
      );
      if (batch.metadata) {
        const { model, provider, usage } = batch.metadata;
        lines.push(
          `    ${model}${provider ? ` via ${provider}` : ""}; tokens ${usage.input_tokens} in / ${usage.output_tokens} out; cost ${usage.cost === undefined ? "unreported" : `$${usage.cost}`}`,
        );
      }
      for (const [id, answer] of Object.entries(batch.answers ?? {}))
        lines.push(`    ${id}: ${JSON.stringify(answer)}`);
    }
  }
  return lines.join("\n");
}
