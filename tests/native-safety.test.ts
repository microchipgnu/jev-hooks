import { expect, it } from "vitest";
import { checkNativePrograms } from "../src/checker/check.js";
it("rejects whole-answer truthiness, aliases, coercion, callbacks, and type erasure", () => {
  const diagnostics = checkNativePrograms("tsconfig.json", [
    "tests/fixtures/native-safety/bad.ts",
  ]);
  expect(diagnostics.length).toBe(17);
  expect(diagnostics.every((item) => item.line > 0 && item.column > 0)).toBe(
    true,
  );
});
it("accepts semantic-field conditions and resolved run output", () => {
  expect(
    checkNativePrograms("tsconfig.json", [
      "tests/fixtures/native-safety/good.ts",
    ]),
  ).toEqual([]);
});
