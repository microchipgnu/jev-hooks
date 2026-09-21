import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createJevHandler } from "../../../src/server/index.js";
import {
  run,
  replay,
  useInput,
  useChoice,
  useNoul,
  useScore,
  CloudflareJevAdapter,
  VercelJevAdapter,
  OpenRouterJevAdapter,
  TypeSafeJevAdapter,
  MockJudgmentAdapter,
  type JudgmentAdapter,
  type JudgmentRequest,
  type ExecutionTrace,
} from "../../../src/index.js";

export function WorkerProgram() {
  const text = useInput<string>("text");
  const state = { text };
  const intent = useChoice("intent", {
    state,
    question: "Intent?",
    options: { refund: "Refund", help: "Help" },
  });
  const urgent = useNoul("urgent", { state, question: "Urgent?" });
  const severity = useScore("severity", {
    state,
    question: "Severity?",
    levels: ["low", "medium", "high"],
  });
  const followup = useNoul("followup", {
    state: {
      text,
      intent: intent.choice,
      urgent: urgent.noul,
      severity: severity.score,
    },
    question: "Follow up?",
  });
  return { text, intent, urgent, severity, followup };
}

export default {
  async fetch(request: Request) {
    const mode = new URL(request.url).pathname.slice(1);
    if (mode === "react") {
      return createJevHandler({
        adapter: new MockJudgmentAdapter(),
        authorize: (request) =>
          request.headers.get("X-Demo-Access") === "allowed",
      })(request);
    }
    const payload = (await request.json()) as {
      text?: string;
      trace?: ExecutionTrace;
    };
    if (mode === "replay")
      return Response.json(await replay(WorkerProgram, payload.trace!));
    if (mode === "safety") {
      const errors: string[] = [];
      for (const input of [
        new Proxy({}, {}),
        {
          get secret() {
            throw new Error("GETTER_EXECUTED");
          },
        },
      ]) {
        try {
          await run(() => "no", { input, adapter: new MockJudgmentAdapter() });
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      let invoked = false;
      try {
        await run(
          async () => {
            invoked = true;
          },
          { input: {}, adapter: new MockJudgmentAdapter() },
        );
      } catch (e) {
        errors.push((e as Error).message);
      }
      return Response.json({ errors, invoked });
    }
    const mock = new MockJudgmentAdapter();
    const respond = async (input: JudgmentRequest, model: string) => ({
      model,
      answers: await mock.evaluate(input),
      usage: { input_tokens: 12, output_tokens: 4 },
    });
    const fetcher =
      (model: string): typeof fetch =>
      async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        return Response.json(await respond(body.input ?? body, model));
      };
    let adapter: JudgmentAdapter;
    switch (mode) {
      case "cloudflare-binding":
        adapter = new CloudflareJevAdapter({
          ai: { run: async (_model, input) => respond(input, "jev-1.13.0") },
        });
        break;
      case "cloudflare-rest":
        adapter = new CloudflareJevAdapter({
          accountId: "test",
          apiToken: "test",
          fetch: fetcher("jev-1.13.0"),
        });
        break;
      case "openrouter":
        adapter = new OpenRouterJevAdapter({
          apiKey: "test",
          fetch: fetcher("typesafe/jev-1.13-20260917"),
        });
        break;
      case "vercel":
        adapter = new VercelJevAdapter({
          apiKey: "test",
          fetch: fetcher("typesafe-ai/jev"),
        });
        break;
      case "typesafe":
        adapter = new TypeSafeJevAdapter(
          new TypeSafeClient({
            apiKey: "test",
            baseURL: "https://api.typesafe.ai",
            retry: { maxRetries: 0 },
            fetch: fetcher("jev-1.13.0"),
          }),
        );
        break;
      default:
        adapter = mock;
    }
    const execution = await run(WorkerProgram, {
      input: { text: payload.text ?? "refund" },
      adapter,
      trace: true,
    });
    return Response.json({ execution, calls: mock.calls });
  },
};
