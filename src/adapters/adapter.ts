import type { JsonValue, RuntimeAnswer, RuntimeQuestion } from "../types.js";
export type JudgmentRequest = {
  readonly state: JsonValue;
  readonly questions: Readonly<Record<string, RuntimeQuestion>>;
};
export type ResponseMetadata = {
  readonly model: string;
  readonly provider?: string;
  readonly providerMetadata?: JsonValue;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cost?: number;
  };
};
export type EvaluationContext = {
  /** Optional cancellation from a reactive client; custom adapters should honor it. */
  readonly signal?: AbortSignal;
  onResponse(metadata: ResponseMetadata): void;
};
export interface JudgmentAdapter {
  evaluate(
    request: JudgmentRequest,
    context?: EvaluationContext,
  ): Promise<Readonly<Record<string, RuntimeAnswer>>>;
}
