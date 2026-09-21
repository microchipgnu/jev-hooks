import type { JudgmentAdapter } from "../adapters/adapter.js";
import { snapshot } from "../runtime/fingerprint.js";
import { prepareRequest, validateAnswers } from "../react/client.js";
import { BodyTooLargeError, readJson } from "../transport/read-json.js";

export type JevHandlerOptions = {
  /** Use a factory to pass request.signal into provider-specific adapters. */
  adapter:
    | JudgmentAdapter
    | ((request: Request) => JudgmentAdapter | Promise<JudgmentAdapter>);
  /** Application authentication, authorization, and rate/budget policy. Runs before body parsing. */
  authorize: (request: Request) => boolean | Promise<boolean>;
};

/** Standard Request/Response endpoint for Workers, Next.js, and other server runtimes. */
export function createJevHandler(
  options: JevHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const respond = (value: unknown, status = 200) =>
      Response.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    if (request.method !== "POST")
      return new Response("Use POST.", {
        status: 405,
        headers: { Allow: "POST" },
      });
    try {
      if (!(await options.authorize(request)))
        return respond({ error: "Forbidden." }, 403);
    } catch {
      return respond({ error: "Authorization unavailable." }, 503);
    }
    let input;
    try {
      input = prepareRequest(snapshot(await readJson(request.body, 200_000)));
      if (Object.keys(input.questions).length > 32)
        return respond({ error: "At most 32 questions per request." }, 400);
    } catch (error) {
      return respond(
        { error: "Invalid judgment request." },
        error instanceof BodyTooLargeError ? 413 : 400,
      );
    }
    try {
      request.signal.throwIfAborted();
      const adapter =
        typeof options.adapter === "function"
          ? await options.adapter(request)
          : options.adapter;
      const answers = validateAnswers(
        await adapter.evaluate(input, {
          onResponse() {},
          signal: request.signal,
        }),
        input,
      );
      request.signal.throwIfAborted();
      return respond({ answers });
    } catch {
      return respond({ error: "Judgment request failed." }, 502);
    }
  };
}
