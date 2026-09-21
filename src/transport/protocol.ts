import { z } from "zod";
import { RuntimeError } from "./errors.js";
const choiceQuestion = z
  .object({
    type: z.literal("choice"),
    instructions: z.string(),
    criteria: z
      .record(z.string(), z.string())
      .refine(
        (c) => Object.keys(c).length >= 1 && Object.keys(c).length <= 255,
        "Choice requires 1..255 options",
      ),
  })
  .strict();
const noulQuestion = z
  .object({
    type: z.literal("noul"),
    instructions: z.string(),
    criteria: z
      .object({ true: z.string(), false: z.string() })
      .strict()
      .optional(),
  })
  .strict();
const scoreQuestion = z
  .object({
    type: z.literal("score"),
    instructions: z.string(),
    criteria: z.array(z.string()).min(2).max(10),
  })
  .strict();
export const requestSchema = z
  .object({
    model: z.string().regex(/^typesafe\/jev-\d+\.\d+(?:\.\d+)?$/),
    state: z.union([
      z.string(),
      z.record(z.string(), z.unknown()),
      z.array(z.unknown()),
    ]),
    questions: z
      .record(
        z.string(),
        z.discriminatedUnion("type", [
          choiceQuestion,
          noulQuestion,
          scoreQuestion,
        ]),
      )
      .refine((q) => Object.keys(q).length > 0),
  })
  .strict();
export type DecisionsRequest = z.infer<typeof requestSchema>;
const choiceAnswer = z
  .object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
  })
  .strict();
const noulAnswer = z
  .object({ type: z.literal("noul"), noul: z.number().min(0).max(1) })
  .strict();
const scoreAnswer = z
  .object({
    type: z.literal("score"),
    score: z.number().finite().nonnegative(),
    confidence: z.number().min(0).max(1).optional(),
    probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
    legend: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export const responseSchema = z
  .object({
    id: z.string().optional(),
    model: z.string(),
    provider: z.string().optional(),
    answers: z.record(
      z.string(),
      z.discriminatedUnion("type", [choiceAnswer, noulAnswer, scoreAnswer]),
    ),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
        cost: z.number().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();
export type DecisionsResponse = z.infer<typeof responseSchema>;
export function validateResponse(
  value: unknown,
  request: DecisionsRequest,
  expectedModel = request.model,
): DecisionsResponse {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success)
    throw new RuntimeError(
      "blocked_inference",
      `Malformed Decisions response: ${parsed.error.message}`,
    );
  const response = parsed.data;
  if (response.model !== expectedModel)
    throw new RuntimeError(
      "blocked_inference",
      `Returned model identity ${JSON.stringify(response.model)} differs from expected ${JSON.stringify(expectedModel)}`,
    );
  const ids = Object.keys(request.questions).sort();
  if (
    JSON.stringify(ids) !== JSON.stringify(Object.keys(response.answers).sort())
  )
    throw new RuntimeError(
      "blocked_inference",
      "Answer IDs differ from question IDs",
    );
  for (const id of ids) {
    const question = request.questions[id]!;
    const answer = response.answers[id]!;
    if (question.type !== answer.type)
      throw new RuntimeError("blocked_inference", "Answer type mismatch");
    if (question.type === "choice" && answer.type === "choice") {
      if (!Object.hasOwn(question.criteria, answer.choice))
        throw new RuntimeError(
          "blocked_inference",
          "Selected option is not a candidate",
        );
      if (answer.probabilities) {
        const keys = Object.keys(answer.probabilities).sort();
        if (
          JSON.stringify(keys) !==
          JSON.stringify(Object.keys(question.criteria).sort())
        )
          throw new RuntimeError(
            "blocked_inference",
            "Probability keys do not match options",
          );
        const sum = Object.values(answer.probabilities).reduce(
          (a, b) => a + b,
          0,
        );
        if (Math.abs(sum - 1) > 1e-5)
          throw new RuntimeError(
            "blocked_inference",
            "Probability distribution does not sum to one",
          );
        const chosen = answer.probabilities[answer.choice]!;
        if (Object.values(answer.probabilities).some((p) => p > chosen + 1e-6))
          throw new RuntimeError(
            "blocked_inference",
            "Choice disagrees with probability maximum",
          );
      }
    }
    if (question.type === "score" && answer.type === "score") {
      const keys = question.criteria.map((_, index) => String(index)).sort();
      if (answer.score > question.criteria.length - 1)
        throw new RuntimeError(
          "blocked_inference",
          "Score is outside the rubric range",
        );
      if (answer.legend) {
        if (
          JSON.stringify(Object.keys(answer.legend).sort()) !==
            JSON.stringify(keys) ||
          question.criteria.some(
            (level, index) => answer.legend![String(index)] !== level,
          )
        )
          throw new RuntimeError(
            "blocked_inference",
            "Score legend does not match the rubric",
          );
      }
      if (answer.probabilities) {
        if (
          JSON.stringify(Object.keys(answer.probabilities).sort()) !==
          JSON.stringify(keys)
        )
          throw new RuntimeError(
            "blocked_inference",
            "Score probability keys do not match rubric indices",
          );
        const sum = Object.values(answer.probabilities).reduce(
          (a, b) => a + b,
          0,
        );
        if (Math.abs(sum - 1) > 1e-5)
          throw new RuntimeError(
            "blocked_inference",
            "Score probability distribution does not sum to one",
          );
        const mean = Object.entries(answer.probabilities).reduce(
          (total, [key, probability]) => total + Number(key) * probability,
          0,
        );
        // Live Jev returns score and probabilities rounded independently to two
        // decimals. Bound their combined rounding error without altering either.
        // Each p(i) contributes at most i * 0.005; score adds another 0.005.
        const levels = question.criteria.length;
        const roundingTolerance = 0.005 * (1 + (levels * (levels - 1)) / 2);
        if (Math.abs(mean - answer.score) > roundingTolerance + 1e-5)
          throw new RuntimeError(
            "blocked_inference",
            `Score ${answer.score} disagrees with the distribution's expected value ${mean}`,
          );
      }
    }
  }
  return response;
}
