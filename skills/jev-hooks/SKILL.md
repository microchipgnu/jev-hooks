---
name: jev-hooks
description: Build applications with the jev-hooks npm SDK using React semantic hooks and a server endpoint, or backend-only programs with run(). Use for Jev hook composition, ambient semantic state, typed judgments, batching, and provider wiring with OpenRouter, TypeSafe, Vercel or Cloudflare.
---

# Build with Jev Hooks

Use `jev-hooks` to derive typed meaning from explicit facts. Compose interpretations; keep arithmetic, canonical state, effects and policy in ordinary code. This skill targets the public 0.2 API.

## Choose the execution model

Inspect the application's framework, installed SDK version, existing authentication and provider configuration. Reuse them. Choose the path the requested product needs:

- **React + backend:** read [references/full-stack.md](references/full-stack.md). Hooks track rendered inputs; a server endpoint performs inference. Use `jev-hooks/react` in client code and `jev-hooks/server` plus a server adapter in the endpoint.
- **Backend only:** read [references/backend.md](references/backend.md). A synchronous program declares hooks; `await run(Program, { input, adapter })` resolves inference passes. No React dependency is required.
- **Provider setup:** read [references/providers.md](references/providers.md) when choosing or changing inference. Hosting and provider are separate choices.

Install with `npm install jev-hooks` (or the application's package manager). Server/tooling baseline: Node 24+, or Workers with `nodejs_compat` and the documented compatibility date. If the installed API differs, inspect its declarations instead of inventing signatures.

## Composition rules that matter

1. Use `useChoice({ state, question, options })`, `useNoul({ state, question })`, or `useScore({ state, question, levels })`. Names are optional; labels are inspector annotations. Don't wire a manual inference DAG.
2. **React:** pass the original semantic result into another hook's `state`. Use `.select(answer => answer.score)` to narrow a dependency while preserving readiness. Render `.data`; passing `.data`, a spread or serialized clone for composition loses reference metadata.
3. **Backend:** read fields such as `pressure.score` inside a pure, synchronous program. Do not use React's `.data` or `.select()`. The runtime replays the program; perform effects only after `run()` resolves.
4. A `SemanticScope` shares React references with descendants. `useAmbient<T>(key)` explicitly consumes one value. Nested scopes add/shadow keys; missing keys return `undefined`. Scope names are not dependency declarations.
5. Focus each input on the facts it actually needs. Equal normalized inputs and questions permit reuse. Same-state independent questions may batch; different inputs can run concurrently but are not one same-state batch.
6. Preserve answer shapes and distributions. Noul is in [0, 1]; Score uses ordered zero-indexed levels, not an automatically normalized probability. Don't invent missing confidence.
7. Keep clients stable across React renders. Respect pending, stale, error and blocked states. A blocked descendant can have `pending: false`; inspect `semantic.status` or fresh data before using it for policy.
8. Backend `run()` resolves one snapshot. New events require another invocation; the SDK does not create durable subscriptions, event ingestion or cross-request storage.

## Server boundary

Use `createJevHandler({ adapter, authorize })` for standard Request/Response integration. Authorization is required. Wire the application's real session/tenant/quota policy; a mock-only local example is not public paid access. Keep provider credentials on the server. Do not put a shared endpoint token into browser code.

Browser batching/cache and server HTTP validation are SDK features. Event reducers, public question allowlists, durable caches, rate/spend limits and external effects are application responsibilities. Do not rebuild the hooks scheduler in the app.

## Verify the requested path

Start with clearly labeled mock semantics when no live provider is configured. Use the starter assets for real imports and adapt their domain to the user's task. Verify an input change, dependent resolution, errors, and that credentials remain outside browser bundles. Exercise unauthorized requests before a live endpoint. Use live inference only within the user's authorized scope.

Report which path/provider was wired, how to run it, and what was actually tested. Do not claim a mock test verified live billing or deployment.

[SDK docs](https://jev-hooks-demo.microchipgnu.workers.dev/docs/) · [API reference](https://jev-hooks-demo.microchipgnu.workers.dev/docs/api/) · [Source](https://github.com/microchipgnu/jev-hooks)
