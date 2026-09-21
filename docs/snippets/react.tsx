"use client";
import { useState } from "react";
import {
  createJevClient,
  JevProvider,
  MockJudgmentAdapter,
  SemanticScope,
  useAmbient,
  useNoul,
  useScore,
} from "jev-hooks/react";
import type { ScoreAnswer, SemanticResult } from "jev-hooks/react";

// Authored fixtures, not live Jev. No API key required.
const mock = new MockJudgmentAdapter(({ state, questions }) => {
  const input = state as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      if (question.type === "score") {
        const score = Number(input.changePct) <= -3 ? 2 : 0;
        return [id, { type: "score" as const, score }];
      }
      const pressure = input.pressure as { score: number };
      return [
        id,
        {
          type: "noul" as const,
          noul: pressure.score === 2 ? Number(input.exposure) : 0.1,
        },
      ];
    }),
  );
});

function Region({ name, exposure }: { name: string; exposure: number }) {
  const pressure = useAmbient<SemanticResult<ScoreAnswer>>("pressure");
  const attention = useNoul({
    state: { pressure, exposure },
    question: "Does this region need immediate attention given its exposure?",
  });
  return (
    <p>
      {name}:{" "}
      {attention.error
        ? "Could not evaluate"
        : attention.pending || attention.stale || !attention.data
          ? "Interpreting…"
          : `${Math.round((attention.data?.noul ?? 0) * 100)}% attention`}
    </p>
  );
}

function World() {
  const [changePct, setChangePct] = useState(0);
  const pressure = useScore({
    state: { changePct },
    question: "How much international economic pressure exists?",
    levels: ["Normal", "Elevated", "Severe"],
  });
  return (
    <SemanticScope values={{ pressure }}>
      <h1>One fact. Different consequences.</h1>
      <p>SIMULATED · US market: {changePct}%</p>
      <button onClick={() => setChangePct(changePct === 0 ? -4 : 0)}>
        {changePct === 0 ? "Send US market drop" : "Reset"}
      </button>
      <Region name="Japan" exposure={0.9} />
      <Region name="Europe" exposure={0.6} />
    </SemanticScope>
  );
}

export default function App() {
  const [client] = useState(() => createJevClient({ adapter: mock }));
  return (
    <JevProvider client={client}>
      <World />
    </JevProvider>
  );
}
