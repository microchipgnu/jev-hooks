// app/api/jev/route.ts — private server-to-server endpoint
import { VercelJevAdapter } from "jev-hooks";
import { createJevHandler } from "jev-hooks/server";

export const runtime = "nodejs";
export const POST = createJevHandler({
  adapter: (request) => new VercelJevAdapter({ signal: request.signal }),
  authorize: (request) => {
    const token = process.env.JEV_ENDPOINT_TOKEN;
    return Boolean(
      token && request.headers.get("authorization") === `Bearer ${token}`,
    );
  },
});
