# Cloudflare Workers

Run the same SDK on Workers using Node compatibility. The built-in Cloudflare adapter can call the Workers AI binding without placing a provider API key in the browser.

## Create the endpoint

In an ESM project using Node 24+ tooling:

```sh
npm install jev-hooks
npm install --save-dev wrangler typescript
mkdir -p src
```

Save this as `src/index.ts`:

<!-- include: snippets/worker.ts -->

Save this as `wrangler.jsonc`:

<!-- include: snippets/wrangler.jsonc -->

This uses the [official Jev model binding](https://developers.cloudflare.com/ai/models/typesafe/jev/) and [Workers Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/). `remote: true` means local development calls the remote, paid model.

## Local and deployed configuration

Put a private endpoint token in `.dev.vars` for local development, and exclude that file from Git:

```text
JEV_ENDPOINT_TOKEN="your-private-endpoint-token"
```

```sh
npx wrangler dev
# In another terminal, set the deployed secret when ready:
npx wrangler secret put JEV_ENDPOINT_TOKEN
npx wrangler deploy
```

Test locally from a trusted terminal with the token exported:

```sh
curl http://localhost:8787/api/jev \
  -H "Authorization: Bearer $JEV_ENDPOINT_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"state":{"changePct":-4},"questions":{"pressure":{"type":"score","instructions":"How much economic pressure exists?","criteria":["Normal","Elevated","Severe"]}}}'
```

The provider model identifier is `typesafe/jev`. The exact response model can differ as the provider updates its deployment; inspect returned metadata or configure an expected response model when you need strict pinning.

## Offline development

Replace the Cloudflare adapter with `new MockJudgmentAdapter()` imported from `jev-hooks`, and remove the AI binding from the local mock configuration. The mock path makes no provider requests. Its default answers are constant fixtures, not interpretations of your input.

## Connect a frontend

Serve your React assets and API on the same origin, then use `createJevClient({ endpoint: "/api/jev" })`. Replace the private bearer-token example with your application's session authorization before connecting a public browser. Never bundle the shared endpoint token in frontend code.

If using a separate origin, your Worker must implement an explicit CORS policy and authenticate those requests. `createJevHandler` does not implement CORS for you.

## State and usage

An isolate's memory is neither shared nor durable. Use Durable Objects, KV or another application store when shared cache/accounting semantics require it. Worldline uses a Durable Object to retain public usage counts and budgets; the SDK does not provision that infrastructure automatically.

The AI binding does not guarantee that a disconnected HTTP client cancels remote inference. Do not infer a zero bill from a cancelled browser request. See [production behavior](deployment.md).
