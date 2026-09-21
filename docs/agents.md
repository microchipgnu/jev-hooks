# Build with an agent

The repository includes a **Jev Hooks skill** that teaches coding agents the public SDK, the two execution models, and the server boundary.

## Install the skill

From your application directory:

```sh
npx skills add microchipgnu/jev-hooks --skill jev-hooks
```

This installs agent instructions; install the library separately:

```sh
npm install jev-hooks
```

The [Skills CLI](https://www.skills.sh/docs/cli) can configure skills for supported coding agents. You can also read or copy the [skill folder on GitHub](https://github.com/microchipgnu/jev-hooks/tree/main/skills/jev-hooks). Keep `SKILL.md`, `references/` and `assets/` together.

## Frontend + backend

```text
React state → Jev hooks → POST /api/jev → server adapter → Jev
                 ↑                                      ↓
           React consumers ← dependent interpretations ← answers
```

Ask your agent:

> Use the jev-hooks skill to add composed semantic state to this React application. Keep provider credentials on the backend, connect the endpoint to our existing session authorization, and start with mock semantics. Show one input change propagating to two dependent components.

The skill shows how to wire:

1. A stable `createJevClient({ endpoint: "/api/jev" })` and `JevProvider` in React.
2. `useScore`, `useNoul` and `useChoice` with semantic references passed into dependent inputs.
3. `SemanticScope` and `useAmbient` to share meaning across components.
4. `createJevHandler({ adapter, authorize })` in a Next.js route or Cloudflare Worker.
5. Your existing authentication and a server-only provider key or AI binding.

The included frontend and endpoint starter files use real imports. The local mock route works without credentials and denies production requests until you wire application authorization. Live provider selection stays explicit.

[Frontend/backend instructions](https://github.com/microchipgnu/jev-hooks/blob/main/skills/jev-hooks/references/full-stack.md) · [React quickstart](quickstart.md) · [Hosting guides](integrations.md)

## Backend only

```text
Event / request → deterministic facts → run(Program) → result → effects
                                          ↓
                              batched and dependent passes
```

Ask your agent:

> Use the jev-hooks skill to build a backend-only program. Compose a Score judgment with a dependent Noul judgment, run it with a mock adapter, and inspect the trace. Then show how to switch to OpenRouter using a server environment variable. No React needed.

The skill shows how to wire:

1. `useInput`, `useScore` and `useNoul` inside a synchronous, pure program.
2. `await run(Program, { input, adapter, trace: true })` in your handler or job.
3. Reading server answer fields directly, such as `pressure.score`.
4. Effects after the run resolves, and a new invocation for each new fact snapshot.

[Backend instructions](https://github.com/microchipgnu/jev-hooks/blob/main/skills/jev-hooks/references/backend.md) · [Backend guide](backend.md)

## Supported providers

The skill covers OpenRouter, direct TypeSafe, Vercel AI Gateway and Cloudflare Workers AI. Hosting and model provider are independent choices. It also explains batching, projections, stale state, mock/live separation, and which caching or budget controls belong to your application.

The skill is distributed through GitHub; it does not require a new npm SDK release.
