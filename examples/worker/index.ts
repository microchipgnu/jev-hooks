import {
  CloudflareJevAdapter,
  MockJudgmentAdapter,
  OpenRouterJevAdapter,
  TypeSafeJevAdapter,
  VercelJevAdapter,
  run,
  useChoice,
  useInput,
  useNoul,
  type CloudflareAiBinding,
  type JudgmentAdapter,
} from "../../src/index.js";
import { TypeSafeClient } from "@typesafe-ai/sdk";

export interface Env {
  AI?: CloudflareAiBinding;
  /** Explicit server configuration; clients cannot select a paid provider. */
  JEV_PROVIDER?: "mock" | "cloudflare" | "openrouter" | "typesafe" | "vercel";
  OPENROUTER_API_KEY?: string;
  TYPESAFE_API_KEY?: string;
  AI_GATEWAY_API_KEY?: string;
}
function Triage() {
  const message = useInput<string>("message");
  const state = { message };
  const intent = useChoice("intent", {
    state,
    question: "What does the customer need?",
    options: {
      refund: "A refund",
      support: "Technical help",
      information: "Information",
    },
  });
  const urgent = useNoul("urgent", { state, question: "Is this urgent?" });
  return { intent, urgent };
}
function adapter(env: Env): JudgmentAdapter {
  switch (env.JEV_PROVIDER ?? "mock") {
    case "mock":
      return new MockJudgmentAdapter();
    case "cloudflare":
      if (!env.AI) throw new Error("Configure the AI binding.");
      return new CloudflareJevAdapter({ ai: env.AI });
    case "openrouter":
      return new OpenRouterJevAdapter({
        apiKey: requireSecret(env.OPENROUTER_API_KEY),
      });
    case "typesafe":
      return new TypeSafeJevAdapter(
        new TypeSafeClient({
          apiKey: requireSecret(env.TYPESAFE_API_KEY),
          baseURL: "https://api.typesafe.ai",
          retry: { maxRetries: 0 },
        }),
      );
    case "vercel":
      return new VercelJevAdapter({
        apiKey: requireSecret(env.AI_GATEWAY_API_KEY),
      });
    default:
      throw new Error("Unsupported JEV_PROVIDER.");
  }
}
function requireSecret(value: string | undefined): string {
  if (!value)
    throw new Error("Configure the selected provider's Worker secret.");
  return value;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST")
      return new Response("POST a JSON object with a message string.", {
        status: 405,
        headers: { Allow: "POST" },
      });
    // Bound inbound bytes, rather than trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return new Response("JSON body required.", { status: 400 });
    let text = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16_384) {
          await reader.cancel();
          return new Response("Body too large.", { status: 413 });
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response("Invalid JSON.", { status: 400 });
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("message" in body) ||
      typeof body.message !== "string" ||
      !body.message.trim() ||
      body.message.length > 4_000
    ) {
      return new Response(
        "message must be a nonempty string of at most 4000 characters.",
        { status: 400 },
      );
    }
    try {
      const execution = await run(Triage, {
        input: { message: body.message },
        adapter: adapter(env),
        trace: true,
      });
      // Keep potentially sensitive full traces server-side, not in the HTTP response.
      return Response.json({
        result: execution.result,
        passes: execution.trace.passes.length,
        requests: execution.trace.requests,
      });
    } catch {
      return new Response("Judgment provider unavailable or misconfigured.", {
        status: 502,
      });
    }
  },
};
