import { describe, expect, it } from "vitest";
import { TypeSafeJevAdapter, run, useNoul } from "../src/index.js";

const live = process.env.TYPESAFE_API_KEY ? describe : describe.skip;
live("TypeSafe System One integration", () => {
  it("translates a real SDK answer through the adapter", async () => {
    function Program() {
      return useNoul("containsHello", {
        state: { text: "hello" },
        question: "Does text contain the word hello?",
      });
    }
    const result = await run(Program, {
      input: {},
      adapter: new TypeSafeJevAdapter(),
    });
    expect(result.type).toBe("noul");
    expect(result.noul).toBeGreaterThanOrEqual(0);
    expect(result.noul).toBeLessThanOrEqual(1);
  }, 30_000);
});
