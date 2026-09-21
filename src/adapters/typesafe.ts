import {
  TypeSafeClient,
  choice,
  noul,
  score,
  type EntryType,
  type ChoiceQuestion,
  type NoulQuestion,
  type ScoreQuestion,
} from "@typesafe-ai/sdk";
import type {
  EvaluationContext,
  JudgmentAdapter,
  JudgmentRequest,
} from "./adapter.js";
import type { RuntimeAnswer, ChoiceOptions, ScoreLevels } from "../types.js";
import { decodeResponse } from "./response.js";

export type TypeSafeJevOptions = {
  readonly signal?: AbortSignal;
  readonly provider?: string;
  readonly expectedResponseModel?: string;
};

/** Official System One adapter. It deliberately exposes only the runtime's narrow batching contract. */
export class TypeSafeJevAdapter implements JudgmentAdapter {
  private readonly options: TypeSafeJevOptions;
  constructor(
    private readonly client = new TypeSafeClient(),
    options: TypeSafeJevOptions = {},
  ) {
    this.options = { ...options };
  }
  async evaluate(
    request: JudgmentRequest,
    context?: EvaluationContext,
  ): Promise<Readonly<Record<string, RuntimeAnswer>>> {
    this.options.signal?.throwIfAborted();
    const questions: Record<
      string,
      ChoiceQuestion<ChoiceOptions> | NoulQuestion | ScoreQuestion<ScoreLevels>
    > = Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => {
        if (question.type === "choice")
          return [id, choice(question.instructions, question.criteria)];
        if (question.type === "noul") return [id, noul(question.instructions)];
        return [id, score(question.instructions, question.criteria)];
      }),
    );
    if (typeof request.state === "number" || typeof request.state === "boolean")
      throw new TypeError(
        "TypeSafe state must be text, an object, an array, or null.",
      );
    // Remove readonly containers for the SDK without changing the state's contents.
    const state: EntryType = structuredClone(request.state) as EntryType;
    const result = await this.client.systemOne(
      { state, questions },
      { signal: this.options.signal },
    );
    return decodeResponse(
      result,
      request,
      context,
      this.options.provider,
      this.options.expectedResponseModel,
    );
  }
}
