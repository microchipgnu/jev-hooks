import { useNoul, type NoulAnswer } from "../../../src/index.js";
const useCustom = () => useNoul("x", { state: "x", question: "x?" });
export function bad() {
  const answer = useCustom();
  const alias = answer;
  if (alias) return 1;
  while (answer) break;
  do {
    break;
  } while (answer);
  for (; answer; ) break;
  const ternary = answer ? 1 : 0;
  const not = !answer;
  const and = answer && 1;
  const or = answer || 1;
  const coalesce = answer ?? 1;
  const boolean = Boolean(answer);
  const bool = Boolean;
  const indirect = bool(answer);
  const filtered = [answer].filter(Boolean);
  const numeric = Number(answer);
  const string = String(answer);
  const type = typeof answer;
  const erased = answer as unknown;
  const annotated: NoulAnswer = answer;
  return {
    ternary,
    not,
    and,
    or,
    coalesce,
    boolean,
    indirect,
    filtered,
    numeric,
    string,
    type,
    erased,
    annotated,
  };
}
