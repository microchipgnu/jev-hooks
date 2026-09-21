import type {
  ScoreAnswer,
  ScoreConfig,
  ScoreLevels,
  JudgmentValue,
} from "../types.js";
import { asJson } from "../runtime/fingerprint.js";
import { session } from "../runtime/session.js";
export function useScore<const L extends ScoreLevels>(
  config: ScoreConfig<L>,
): JudgmentValue<ScoreAnswer<L>>;
export function useScore<const L extends ScoreLevels>(
  id: string,
  config: ScoreConfig<L>,
): JudgmentValue<ScoreAnswer<L>>;
export function useScore<const L extends ScoreLevels>(
  idOrConfig: string | ScoreConfig<L>,
  namedConfig?: ScoreConfig<L>,
): JudgmentValue<ScoreAnswer<L>> {
  const config = typeof idOrConfig === "string" ? namedConfig! : idOrConfig;
  const id = typeof idOrConfig === "string" ? idOrConfig : session().nextId();
  return session().judgment(id, asJson(config.state), {
    type: "score",
    instructions: config.question,
    criteria: asJson(config.levels) as L,
  });
}
