import { CloudflareJevAdapter, type CloudflareAiBinding } from "jev-hooks";
import { createJevHandler } from "jev-hooks/server";

interface Env {
  AI: CloudflareAiBinding;
  JEV_ENDPOINT_TOKEN: string;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/api/jev")
      return new Response("Not found", { status: 404 });
    return createJevHandler({
      adapter: new CloudflareJevAdapter({ ai: env.AI }),
      authorize: (request) =>
        Boolean(
          env.JEV_ENDPOINT_TOKEN &&
            request.headers.get("authorization") ===
              `Bearer ${env.JEV_ENDPOINT_TOKEN}`,
        ),
    })(request);
  },
};
