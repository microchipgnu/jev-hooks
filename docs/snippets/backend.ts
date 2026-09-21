import {
  run,
  useInput,
  useScore,
  useNoul,
  MockJudgmentAdapter,
  formatTrace,
} from "jev-hooks";

function World() {
  const market = useInput<{ changePct: number }>("market");
  const pressure = useScore({
    state: market,
    question: "How much international economic pressure exists?",
    levels: ["Normal", "Elevated", "Severe"],
  });
  const attention = useNoul({
    state: { pressure: pressure.score, exposure: 0.9 },
    question: "Does this region need immediate attention?",
  });
  return { pressure, attention };
}

const execution = await run(World, {
  input: { market: { changePct: -4 } },
  adapter: new MockJudgmentAdapter(),
  trace: true,
});
console.log("SIMULATED", execution.result);
console.log(formatTrace(execution.trace));
// Perform effects here, after run resolves. Call run again for new facts.
