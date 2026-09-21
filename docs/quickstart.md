# React quickstart

Build a tiny world model: a US market event changes shared pressure; Japan and Europe interpret it against different local exposure.

## Try it now

This runs the exact example below, using authored fixtures and the real React runtime.

<iframe title="Interactive Jev Hooks quickstart" src="/docs/playground/" style="width:100%;height:285px;border:1px solid #dce3dd;border-radius:7px" loading="lazy"></iframe>

## Install

Use Node 24+ for tooling and React 18.2+ or 19.

```sh
npm install jev-hooks react react-dom
```

In an existing React TypeScript app, replace `App.tsx` with this complete example. In Next.js, it can be a client page. No endpoint or API key is needed.

<!-- include: snippets/react.tsx -->

## What happens

1. Clicking the button updates an ordinary React number.
2. `useScore` interprets that fact. Its input changed, so its previous answer becomes stale.
3. `SemanticScope` makes the pressure reference available to both region components.
4. Each region explicitly reads it with `useAmbient("pressure")`.
5. Passing that reference into `useNoul` creates a dependency. The hook waits for fresh pressure, then evaluates with its own exposure.

The fixtures intentionally produce different regional answers. Only the answer source is simulated; dependency discovery, waiting, caching and React propagation use the real runtime.

## Switch to live Jev

After configuring an authenticated [server endpoint](integrations.md), replace the client initializer:

```tsx
const [client] = useState(() => createJevClient({ endpoint: "/api/jev" }));
```

Keep the client stable across renders. Same-origin session cookies accompany requests. Provider credentials stay on the server. The private bearer-token starters in the hosting guides must be adapted to your application's session authorization before connecting a public browser; never embed their shared server token in client code.

## Read versus compose

Render `attention.data?.noul`, `attention.pending`, and `attention.error`. To compose, pass the original `attention` reference, or `attention.select(answer => answer.noul)`. Passing `.data` alone loses dependency and readiness metadata.

Read [composition](concepts.md) next, or consult the full [React API](react.md).
