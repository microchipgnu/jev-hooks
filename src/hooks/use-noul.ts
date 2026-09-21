import type { NoulAnswer, NoulConfig, JudgmentValue } from "../types.js";
import { asJson } from "../runtime/fingerprint.js";
import { session } from "../runtime/session.js";
export function useNoul(config: NoulConfig): JudgmentValue<NoulAnswer>;
export function useNoul(
  id: string,
  config: NoulConfig,
): JudgmentValue<NoulAnswer>;
export function useNoul(
  idOrConfig: string | NoulConfig,
  namedConfig?: NoulConfig,
): JudgmentValue<NoulAnswer> {
  const config = typeof idOrConfig === "string" ? namedConfig! : idOrConfig;
  const id = typeof idOrConfig === "string" ? idOrConfig : session().nextId();
  return session().judgment(id, asJson(config.state), {
    type: "noul",
    instructions: config.question,
  });
}
