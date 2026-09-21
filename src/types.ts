export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

// String descriptions match the existing OpenRouter Decisions contract.
export type ChoiceOptions = Readonly<Record<string, string>>;
export type ScoreLevels = readonly [string, string, ...string[]];

export type ChoiceAnswer<O extends ChoiceOptions = ChoiceOptions> = Pick<
  ChoiceResponse<O>,
  "type" | "choice"
> &
  Partial<Pick<ChoiceResponse<O>, "confidence" | "probabilities">>;
export type NoulAnswer = NoulResponse;
export type ScoreAnswer<L extends ScoreLevels = ScoreLevels> = Pick<
  ScoreResponse<L>,
  "type" | "score"
> &
  Partial<Pick<ScoreResponse<L>, "confidence" | "legend" | "probabilities">>;
export type RuntimeAnswer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

/** Compile-time marker for the program-safety checker; never sent to Jev. */
declare const jevAnswerBrand: unique symbol;
export type JudgmentValue<T extends RuntimeAnswer> = T & {
  readonly [jevAnswerBrand]: true;
};
export type Resolved<T> =
  T extends JudgmentValue<RuntimeAnswer>
    ? Omit<T, typeof jevAnswerBrand>
    : T extends object
      ? { [K in keyof T]: Resolved<T[K]> }
      : T;

export type JudgmentDependency = {
  readonly id: string;
  readonly fingerprint: string;
  readonly fields: readonly string[];
};

export type RuntimeQuestion =
  | {
      readonly type: "choice";
      readonly instructions: string;
      readonly criteria: ChoiceOptions;
    }
  | { readonly type: "noul"; readonly instructions: string }
  | {
      readonly type: "score";
      readonly instructions: string;
      readonly criteria: ScoreLevels;
    };

export type JudgmentDeclaration = {
  readonly id: string;
  readonly question: RuntimeQuestion;
  readonly state: JsonValue;
  readonly stateFingerprint: string;
  readonly fingerprint: string;
  readonly dependencies: readonly JudgmentDependency[];
};

export type ChoiceConfig<O extends ChoiceOptions> = {
  /** Validated as JSON-like when the hook is evaluated. */
  readonly state: unknown;
  readonly question: string;
  /** Optional inspector annotation; does not determine identity or caching. */
  readonly label?: string;
  readonly options: O;
};
export type NoulConfig = {
  readonly state: unknown;
  readonly question: string;
  readonly label?: string;
};
export type ScoreConfig<L extends ScoreLevels> = {
  /** Validated as JSON-like when the hook is evaluated. */
  readonly state: unknown;
  readonly question: string;
  readonly label?: string;
  readonly levels: L;
};
import type {
  ChoiceResponse,
  NoulResponse,
  ScoreResponse,
} from "@typesafe-ai/sdk";
