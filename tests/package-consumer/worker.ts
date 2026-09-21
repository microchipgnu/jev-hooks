import { run, useNoul, CloudflareJevAdapter } from "jev-hooks";

export default {
  async fetch() {
    let calls = 0;
    const adapter = new CloudflareJevAdapter({
      ai: {
        async run(model, input) {
          if (
            model !== "typesafe/jev" ||
            Object.keys(input.questions).length !== 2
          )
            throw new Error("Bad Cloudflare batch");
          calls++;
          return {
            model: "jev-1.13.0",
            answers: {
              a: { type: "noul", noul: 0.9 },
              b: { type: "noul", noul: 0.2 },
            },
            usage: { input_tokens: 1, output_tokens: 1 },
          };
        },
      },
    });
    const result = await run(
      () => {
        const a = useNoul("a", { state: "hello", question: "Greeting?" });
        const b = useNoul("b", { state: "hello", question: "Urgent?" });
        return { a, b };
      },
      { input: {}, adapter },
    );
    return Response.json({ result, calls });
  },
};
