import { useChoice, useInput, useNoul, useScore } from "../src/index.js";
import { demo } from "./native-demo.js";
type Ticket = { subject: string; body: string };
function Triage() {
  const ticket = useInput<Ticket>("ticket");
  const intent = useChoice("intent", {
    state: { ticket },
    question: "What is the customer's primary intent?",
    options: {
      refund: "The customer wants money returned.",
      support: "The customer needs help resolving a problem.",
      information: "The customer primarily wants information.",
    },
  });
  const urgent = useNoul("urgent", {
    state: { ticket },
    question: "Does this ticket require urgent attention?",
  });
  const severity = useScore("severity", {
    state: { ticket, intent: intent.choice, urgent: urgent.noul },
    question: "How severe is the customer's situation?",
    levels: ["Minor.", "Moderate.", "Serious."],
  });
  return { intent, urgent, severity };
}
await demo(Triage, {
  ticket: { subject: "Duplicate charge", body: "Please refund this today." },
});
