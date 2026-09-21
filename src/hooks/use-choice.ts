import type {
  ChoiceAnswer,
  ChoiceConfig,
  ChoiceOptions,
  JudgmentValue,
} from "../types.js";
import { asJson } from "../runtime/fingerprint.js";
import { session } from "../runtime/session.js";
export function useChoice<const O extends ChoiceOptions>(
  config: ChoiceConfig<O>,
): JudgmentValue<ChoiceAnswer<O>>;
export function useChoice<const O extends ChoiceOptions>(
  id: string,
  config: ChoiceConfig<O>,
): JudgmentValue<ChoiceAnswer<O>>;
export function useChoice<const O extends ChoiceOptions>(
  idOrConfig: string | ChoiceConfig<O>,
  namedConfig?: ChoiceConfig<O>,
): JudgmentValue<ChoiceAnswer<O>> {
  const config = typeof idOrConfig === "string" ? namedConfig! : idOrConfig;
  const id = typeof idOrConfig === "string" ? idOrConfig : session().nextId();
  return session().judgment(id, asJson(config.state), {
    type: "choice",
    instructions: config.question,
    criteria: asJson(config.options) as O,
  });
}
