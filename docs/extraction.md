# Extraction and release notes

Extracted on 2026-09-20 from the local working tree of `../jev`. This is an independent source copy, not a symlink, workspace dependency, Git submodule, or runtime reference to that repository. It includes uncommitted hooks work present at extraction time. The original repository is retained unchanged.

## Included

- `src/native` becomes this repository's `src`; hooks are the root public API.
- The validated OpenRouter Decisions transport is included under `src/transport`, along with only its required error/cancellation helpers.
- Mock and official TypeSafe SDK adapters, tracing/replay, relevant unit/integration tests, static-safety fixtures, and all five hooks demos are preserved.
- The safety checker is a packaged `jev-check` executable and `jev-hooks/check` module, with an optional pinned TypeScript peer.
- A source-only build, explicit package file allowlist, and isolated install smoke test replace the combined application's packaging.

## Excluded

MCP clients/servers, research workflows, workflow controllers, policy engine, persisted run artifacts, HTML reports, evaluations for those workflows, and their dependencies. The source repository's root-workflow-export preservation test is intentionally excluded because that API does not exist in this library. No `.env` credentials or original Git history were copied.

## Release procedure

1. Verify the target version of `jev-hooks` is not already published.
2. Run `pnpm test`, `pnpm test:package`, and the mock demos. Live checks require separate authorization because they incur inference charges.
3. Review `npm pack --dry-run`, the supported Node/TypeScript versions, and the model pin.
4. Publish with `npm publish --access public`, then verify the registry version and an isolated installation.

The initial extraction did not publish to npm or create a hosted Git repository. Publication is now configured for the public npm registry. Local `pnpm pack` and tarball installation also work without publication. The minimum Node version remains 24; the upper restriction was removed to permit the current Node 26 environment. The checker retains the source repository's pinned TypeScript 7 dependency.

## Extraction verification

- Build, typecheck, and program-safety checks passed.
- Hooks suite: 72 passed, one direct-TypeSafe integration test skipped without credentials.
- Unit tests and isolated package-consumer checks passed on Node 24.21.0 and Node 26.0.0.
- The installed archive exports runtime JavaScript and declarations, preserves Choice literal types, runs mock inference and replay, and exposes a working `jev-check` that rejects a deliberately unsafe program.
- Triage, research, clock, replay, and support-chat mock demos ran successfully.
- SHA-256 checks of all 38 copied source/test/example files confirmed the source repository was not modified.
- No paid inference was executed during extraction. No credentials, Git remote, or npm publication were created.
