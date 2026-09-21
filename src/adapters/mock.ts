import type { JudgmentAdapter, JudgmentRequest } from "./adapter.js";
import type { RuntimeAnswer } from "../types.js";

export class MockJudgmentAdapter implements JudgmentAdapter {
  readonly calls: JudgmentRequest[] = [];
  constructor(
    private readonly responder: (
      request: JudgmentRequest,
    ) =>
      | Readonly<Record<string, RuntimeAnswer>>
      | Promise<Readonly<Record<string, RuntimeAnswer>>> = defaultAnswers,
  ) {}
  async evaluate(
    request: JudgmentRequest,
  ): Promise<Readonly<Record<string, RuntimeAnswer>>> {
    this.calls.push(request);
    return this.responder(request);
  }
}
function defaultAnswers(
  request: JudgmentRequest,
): Readonly<Record<string, RuntimeAnswer>> {
  return Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      if (question.type === "noul") return [id, { type: "noul", noul: 0.75 }];
      if (question.type === "choice") {
        const keys = Object.keys(question.criteria);
        const choice = keys[0]!;
        return [
          id,
          {
            type: "choice",
            choice,
            confidence: 0.8,
            probabilities: Object.fromEntries(
              keys.map((key) => [key, key === choice ? 1 : 0]),
            ),
          },
        ];
      }
      const keys = question.criteria.map((_, index) => String(index));
      return [
        id,
        {
          type: "score",
          score: 1,
          confidence: 0.8,
          legend: Object.fromEntries(
            keys.map((key, index) => [key, question.criteria[index]!]),
          ),
          probabilities: Object.fromEntries(
            keys.map((key) => [key, key === "1" ? 1 : 0]),
          ),
        },
      ];
    }),
  );
}
