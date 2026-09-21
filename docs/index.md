# Compose meaning like state.

Jev Hooks makes typed model judgments part of ordinary application composition. Facts change, dependent interpretations update, and React renders the consequences.

```text
market → pressure ─┬→ Japan attention
                  └→ Europe attention
```

Pass a hook's result into another hook's `state`. That argument creates the dependency. You don't maintain a second graph or write `dependsOn` declarations.

```tsx
const pressure = useScore({
  state: market,
  question: "How much economic pressure exists?",
  levels: ["Normal", "Elevated", "Severe"],
});

const attention = useNoul({
  state: { pressure, exposure },
  question: "Does this region need attention?",
});
```

## Start here

- [React quickstart](quickstart.md): a working, interactive example with no API key.
- [Composition and ambient state](concepts.md): why an argument creates an edge, and how meaning crosses components.
- [Backend programs](backend.md): compose judgments in Node.js or a Worker, without React.
- [Deploy an endpoint](integrations.md): Next.js on Vercel, Cloudflare Workers, or another Request/Response server.
- [Open Worldline](https://jev-hooks-demo.microchipgnu.workers.dev): send one US event and inspect its different consequences for Japan and Europe.

## Three typed primitives

| Hook | Answer | Example |
| --- | --- | --- |
| `useChoice` | One named option, plus available distribution | Situation: weather, transport, economic |
| `useNoul` | A value from 0 to 1 | Degree to which attention is warranted |
| `useScore` | A score over ordered, zero-indexed levels | Normal → elevated → severe |

Facts and arithmetic stay in code. Jev interprets those facts. Code decides policy, effects and presentation. Answers are interpretations, not external measurements.

## Two runtimes, one composition idea

**React** keeps semantic hooks synchronized with rendered state. **Backend programs** resolve a synchronous function in asynchronous inference passes through `run()`. A new server event starts a new run; the package does not install a background event loop.

The SDK handles compatible batching, dependent passes, answer validation and trace metadata. Your application owns events, authorization, persistence and spend policy.

Jev Hooks is an independent library built around Jev. It is not the official TypeSafe SDK. These guides describe the 0.2 API and retain compatibility with named 0.1 hooks.
