import { useChoice, useInput, useNoul } from "../src/index.js";
import { demo } from "./native-demo.js";
type Source = { title: string; text: string };
function EvaluateSource() {
  const source = useInput<Source>("source");
  const goal = useInput<string>("goal");
  const relevant = useNoul("relevant", {
    state: { source, goal },
    question: "Does source contain information relevant to goal?",
  });
  const sourceType = useChoice("sourceType", {
    state: { source, goal },
    question: "What kind of source is source?",
    options: {
      primary: "Original documentation, data, research, or direct evidence.",
      secondary: "Commentary or reporting based on other sources.",
      unclear: "The source type cannot be established.",
    },
  });
  return { relevant, sourceType };
}
await demo(EvaluateSource, {
  source: { title: "SDK docs", text: "Official API reference" },
  goal: "Learn the API",
});
