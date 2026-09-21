import { useNoul } from "jev-hooks";
export function InvalidProgram() {
  const answer = useNoul("a", { state: "hello", question: "Greeting?" });
  if (answer) return "This must fail the program-safety check.";
  return "no";
}
