import { useChoice, useInput, useScore } from "../src/index.js";
import { demo } from "./native-demo.js";
function SmartClock() {
  const now = useInput<string>("now");
  const nextEvent = useInput<{ title: string; startsAt: string }>("nextEvent");
  const travelMinutes = useInput<number>("travelMinutes");
  const state = { now, nextEvent, travelMinutes };
  const attention = useChoice("attention", {
    state,
    question: "What information deserves the user's attention right now?",
    options: {
      time: "The current time itself is most useful.",
      event: "The upcoming event should be emphasized.",
      leave: "The user should be told it is time or nearly time to leave.",
    },
  });
  const urgency = useScore("urgency", {
    state,
    question:
      "How urgent is the upcoming event relative to the current situation?",
    levels: [
      "No urgency.",
      "Some attention is warranted.",
      "Immediate attention is warranted.",
    ],
  });
  return { attention, urgency };
}
await demo(SmartClock, {
  now: "2026-09-18T23:30:00+09:00",
  nextEvent: { title: "Dinner", startsAt: "2026-09-19T00:15:00+09:00" },
  travelMinutes: 35,
});
