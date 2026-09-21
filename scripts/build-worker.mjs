import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
// Absolute output avoids Wrangler's differing config-relative/CWD-relative paths.
execFileSync(
  resolve(root, "node_modules/.bin/wrangler"),
  [
    "deploy",
    "--dry-run",
    "--config",
    resolve(root, "examples/worker/wrangler.jsonc"),
    "--outdir",
    resolve(root, ".wrangler/build"),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
