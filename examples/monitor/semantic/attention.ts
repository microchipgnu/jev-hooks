import {
  useAmbient,
  useNoul,
  type SemanticResult,
  type ScoreAnswer,
} from "../../../src/react/index.js";
import { attentionQuestion } from "./contract.js";

type Pressure = SemanticResult<ScoreAnswer>;

// This function is shown verbatim beside the running region component.
export function useMarketAttention(exposure: number) {
  const shared = useAmbient<Pressure>("pressure")!;
  const pressure = shared.select((answer) => answer.score);
  return useNoul(
    {
      state: { pressure, exposure },
      question: attentionQuestion,
    },
    { debounceMs: 60 },
  );
}

export const alertThreshold = 0.8;
// Ordinary application policy. Jev supplies the answer; code chooses the UI.
export function attentionPolicy(noul: number) {
  return noul >= alertThreshold ? "alert" : "watch";
}
