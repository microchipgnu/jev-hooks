"use client";
import { useState } from "react";
import {
  createJevClient,
  JevProvider,
  SemanticScope,
  useAmbient,
  useNoul,
  useScore,
  type ScoreAnswer,
  type SemanticResult,
} from "jev-hooks/react";

function Region({ exposure }: { exposure: number }) {
  const pressure = useAmbient<SemanticResult<ScoreAnswer>>("pressure");
  const attention = useNoul(
    {
      state: { pressure: pressure?.select((answer) => answer.score), exposure },
      question:
        "Does this region need immediate attention given pressure and exposure?",
    },
    { enabled: pressure !== undefined },
  );
  if (!pressure) return <p>Place Region inside the pressure scope.</p>;
  if (attention.error)
    return <button onClick={attention.refetch}>Retry interpretation</button>;
  if (!attention.data || attention.pending || attention.stale)
    return <p>Interpreting…</p>;
  return <p>Attention: {attention.data.noul.toFixed(2)}</p>;
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
      <p>Market change: {changePct}%</p>
      <button onClick={() => setChangePct(changePct === 0 ? -4 : 0)}>
        Change facts
      </button>
      <Region exposure={0.9} />
      <Region exposure={0.6} />
    </SemanticScope>
  );
}

export default function App() {
  const [client] = useState(() => createJevClient({ endpoint: "/api/jev" }));
  return (
    <JevProvider client={client}>
      <World />
    </JevProvider>
  );
}
