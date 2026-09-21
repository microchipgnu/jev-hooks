import { useChoice, useNoul, run } from "../../../src/index.js";
export function good() {
  const urgent = useNoul("urgent", { state: "x", question: "urgent?" });
  const intent = useChoice("intent", {
    state: "x",
    question: "intent?",
    options: { help: "help", refund: "refund" },
  });
  if (intent.choice === "refund" && urgent.noul > 0.8) return "refund urgently";
  return urgent.noul ? "some probability" : "zero probability";
}
export async function application() {
  const result = await run(() => useNoul("x", { state: "x", question: "x?" }), {
    input: {},
  });
  // run returns plain, resolved data, without a pending handle's marker.
  return Boolean(result);
}
