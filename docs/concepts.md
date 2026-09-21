# Composition is the graph

A hook is a semantic computed value: focused facts go in; a bounded interpretation comes out.

```tsx
const pressure = useScore({
  state: market,
  question: "How much international economic pressure exists?",
  levels: ["Normal", "Elevated", "Severe"],
});
const attention = useNoul({
  state: { pressure, exposure },
  question: "Does this region need immediate attention?",
});
```

`pressure` is a semantic reference. The runtime discovers it in the second hook's state, waits for it to become fresh, and substitutes its answer in the request. You don't name nodes to connect them. Optional labels help the inspector; they are not dependency declarations.

## Ambient means available through scope

```tsx
<SemanticScope values={{ pressure }}>
  <Japan />
  <Europe />
  <WorldStatus />
</SemanticScope>
```

Inside any descendant:

```tsx
const pressure = useAmbient<SemanticResult<ScoreAnswer>>("pressure");
```

Import these types and helpers from `jev-hooks/react`. A scope shares references without prop drilling. Consumption stays explicit. Nested scopes add values and shadow matching keys; unmounting an inner scope restores the outer value. Missing keys return `undefined`.

A context key names an available value. It does not manually connect inference nodes. Passing the returned reference into another judgment establishes that connection.

## What invalidates a judgment?

Its normalized input and question definition determine reuse. Unrelated state outside that input does not invalidate it. Returning a new object with equal JSON contents does not force inference.

By default, composition consumes the full answer, including a distribution when present. If you only need the selected score:

```tsx
const attention = useNoul({
  state: { pressure: pressure.select(answer => answer.score), exposure },
  question: "Does this region need immediate attention?",
});
```

The projection preserves the dependency while narrowing its value. Once the upstream hook settles, an unchanged projected value can reuse the downstream answer. The dependent still waits while its ancestor is stale. Do not spread, clone or serialize a reference to compose it: that loses its runtime registration.

## Batches and passes

Independent ready questions with identical normalized state can share a request. Different regional exposure means different state, so Japan and Europe can run concurrently but do not become one same-state batch. Dependents wait for their inputs; this creates later passes without an application scheduler.

In React, batching uses a short collection window. It is not a guarantee that every independent question across the whole app becomes one request. The default client caches completed answers for five minutes with a 512-entry limit.

## Is this Redux or Zustand?

It complements a fact store. Redux, Zustand or `useState` can own deterministic facts. Jev Hooks derives semantic state from focused slices of those facts. A semantic answer is not a replacement for your canonical state or reducer.

## Where composition stops

React hooks subscribe through React rendering and scope. They are not mutable signals you can retain indefinitely outside React. Backend `run()` is a bounded computation over one input snapshot, not a continuously running store. External events and durable workflows remain application responsibilities.
