import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "jev-hooks-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packed = JSON.parse(
  execFileSync(
    npm,
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
    { cwd: root, encoding: "utf8" },
  ),
)[0];
const files = packed.files.map((file) => file.path);
for (const required of [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/checker/cli.js",
  "dist/checker/check.d.ts",
  "dist/react/index.js",
  "dist/react/index.d.ts",
  "dist/server/index.js",
])
  assert(files.includes(required), `Missing ${required}`);
assert(
  !files.some(
    (path) =>
      /^(src|tests|examples|node_modules|runs)\//.test(path) ||
      path.startsWith(".env"),
  ),
);
assert(!files.some((path) => /\/(mcp|workflows|engine)\//.test(path)));

const consumer = join(temporary, "consumer");
cpSync(join(root, "tests/package-consumer"), consumer, { recursive: true });
execFileSync(
  npm,
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(temporary, packed.filename),
  ],
  { cwd: consumer, stdio: "inherit" },
);
const manifest = JSON.parse(
  readFileSync(join(consumer, "node_modules/jev-hooks/package.json"), "utf8"),
);
assert(
  !existsSync(join(consumer, "node_modules/react")),
  "Server-only installs must not require React",
);
assert(
  readFileSync(
    join(consumer, "node_modules/jev-hooks/dist/react/index.js"),
    "utf8",
  ).startsWith('"use client";'),
);
assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
  "@typesafe-ai/sdk",
  "zod",
]);
const compiler = resolve(consumer, "node_modules/.bin/tsc");
const checker = resolve(consumer, "node_modules/.bin/jev-check");
execFileSync(compiler, ["-p", "tsconfig.json"], {
  cwd: consumer,
  stdio: "inherit",
});
execFileSync(checker, ["--project", "tsconfig.json", "good.ts"], {
  cwd: consumer,
  stdio: "inherit",
});
const invalid = spawnSync(checker, ["--project", "tsconfig.json", "bad.ts"], {
  cwd: consumer,
  encoding: "utf8",
});
assert.equal(invalid.status, 1, invalid.stderr);
assert.match(invalid.stderr, /Whole Jev answers/);
execFileSync(process.execPath, ["dist/good.js"], {
  cwd: consumer,
  stdio: "inherit",
});
const bundled = await build({
  entryPoints: [join(consumer, "worker.ts")],
  bundle: true,
  write: false,
  platform: "neutral",
  format: "esm",
  external: ["node:*"],
  conditions: ["workerd", "import"],
  mainFields: ["module", "main"],
  target: "es2023",
});
const worker = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: "2026-09-01",
    compatibilityFlags: ["nodejs_compat"],
    script: bundled.outputFiles[0].text,
    outboundService: () => {
      throw new Error("No network permitted in packaged Worker test");
    },
  }),
);
try {
  const response = await worker.dispatchFetch("http://localhost/");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    result: { a: { type: "noul", noul: 0.9 }, b: { type: "noul", noul: 0.2 } },
    calls: 1,
  });
} finally {
  await worker.dispose();
}
// Add React only after proving the original server consumer works without it.
execFileSync(
  npm,
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "react@19.3.0",
    "react-dom@19.3.0",
    "@types/react@19.3.0",
    "@types/react-dom@19.3.0",
  ],
  { cwd: consumer, stdio: "inherit" },
);
cpSync(join(root, "skills/jev-hooks/assets"), join(consumer, "skill-assets"), {
  recursive: true,
});
cpSync(join(root, "docs/snippets"), join(consumer, "docs-snippets"), {
  recursive: true,
});
execFileSync(
  compiler,
  [
    "--ignoreConfig",
    "--types",
    "node,react",
    "--target",
    "ES2023",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--strict",
    "--skipLibCheck",
    "--outDir",
    "react-dist",
    "react.ts",
    "browser.ts",
    "--jsx",
    "react-jsx",
    "docs-snippets/react.tsx",
    "docs-snippets/backend.ts",
    "docs-snippets/next-route.ts",
    "docs-snippets/worker.ts",
    "skill-assets/frontend.tsx",
    "skill-assets/backend.ts",
    "skill-assets/endpoint.ts",
  ],
  { cwd: consumer, stdio: "inherit" },
);
execFileSync(process.execPath, ["react-dist/react.js"], {
  cwd: consumer,
  stdio: "inherit",
});
execFileSync(process.execPath, ["react-dist/docs-snippets/backend.js"], {
  cwd: consumer,
  stdio: "inherit",
});
cpSync(
  join(root, "scripts/test-docs-endpoints.mjs"),
  join(consumer, "test-docs-endpoints.mjs"),
);
execFileSync(process.execPath, ["test-docs-endpoints.mjs"], {
  cwd: consumer,
  stdio: "inherit",
});
execFileSync(process.execPath, ["react-dist/skill-assets/backend.js"], {
  cwd: consumer,
  stdio: "inherit",
});
const browser = await build({
  entryPoints: [
    join(consumer, "browser.ts"),
    join(consumer, "skill-assets/frontend.tsx"),
  ],
  outdir: join(temporary, "browser-check"),
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  metafile: true,
  logLevel: "silent",
});
assert(!browser.outputFiles[0].text.includes("node:"));
assert(
  !Object.keys(browser.metafile.inputs).some((path) =>
    /@typesafe-ai\/sdk|checker\//.test(path),
  ),
);
console.log(
  `PASS: archive, isolated installs with/without React, public types, browser bundle, SSR, server endpoint, Node + Workers runtime, replay, and installed checker.\nInspect consumer: ${consumer}`,
);
