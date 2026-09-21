# Installation

Install [jev-hooks from npm](https://www.npmjs.com/package/jev-hooks):

```sh
npm install jev-hooks
```

Or use your preferred package manager:

```sh
pnpm add jev-hooks
```

```sh
bun add jev-hooks
```

## React applications

Use React 18.2+ or 19 and import hooks from `jev-hooks/react`. If React is not already installed:

```sh
npm install jev-hooks react react-dom
```

Follow the [React quickstart](quickstart.md) for a complete example without an API key.

## Backend programs

Use Node.js 24+ and import from `jev-hooks`. React is optional and is not required for server-only applications.

See [backend programs](backend.md) for `run()`, typed judgments and inference passes.

## Hosting integrations

- [Next.js / Vercel](vercel.md): a server route and browser client.
- [Cloudflare Workers](cloudflare.md): an AI binding and Worker endpoint.

Provider credentials stay on the server. Choose a provider independently of your hosting platform.
