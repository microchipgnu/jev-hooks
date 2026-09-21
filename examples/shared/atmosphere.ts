import type { JudgmentRequest } from "../../src/adapters/adapter.js";

/** The public demo always runs these questions, regardless of client input. */
export const atmosphereQuestions = {
  mood: {
    type: "choice",
    instructions: "What atmosphere fits this moment?",
    criteria: {
      calm: "Quiet and reflective",
      playful: "Curious and playful",
      intense: "Bold and energetic",
    },
  },
  motion: {
    type: "score",
    instructions: "How much movement fits this moment?",
    criteria: ["Still", "Gentle", "Lively", "Fast", "Electric"],
  },
  excitement: {
    type: "noul",
    instructions: "Does this moment feel energetic?",
  },
} as const satisfies JudgmentRequest["questions"];
