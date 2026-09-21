import { useMemo } from "react";
import {
  useChoice,
  useNoul,
  useScore,
  type JudgmentResult,
  type SemanticResult,
  type SemanticReference,
} from "../../../src/react/index.js";
import type {
  RuntimeAnswer,
  RuntimeQuestion,
  ScoreAnswer,
  ChoiceAnswer,
  NoulAnswer,
} from "../../../src/types.js";
import type { WorldFacts, PlaceId } from "../events/model.js";
import { places } from "../events/model.js";
import {
  groups,
  projectFacts,
  normalizeMonitorInput,
  type MonitorInput,
} from "./contract.js";
import { fingerprint } from "./runtime.js";
export type Cell = JudgmentResult<RuntimeAnswer> & {
  id: string;
  reference: SemanticResult<RuntimeAnswer>;
  input: MonitorInput;
  fingerprint: string;
  dependencies: string[];
  pass: number;
  status: "ready" | "dirty" | "blocked" | "error";
  ready: boolean;
};
export type Bundle = { cells: Record<string, Cell>; ready: boolean };
export function value(answer?: RuntimeAnswer): string | number | undefined {
  return answer?.type === "choice"
    ? answer.choice
    : answer?.type === "score"
      ? answer.score
      : answer?.noul;
}
type Input = Omit<MonitorInput, "inherited"> & {
  inherited: Record<string, SemanticReference<string | number>>;
};
export function inputFor(
  id: string,
  facts: WorldFacts,
  inherited: Input["inherited"] = {},
): Input {
  const group = groups[id]!;
  return {
    kind: group.kind,
    scopeId: id,
    facts: projectFacts(group, facts),
    inherited,
  };
}
/** Inspector projection only. Scheduling and dependency discovery belong to the SDK. */
export function useBundle(
  answers: Record<string, SemanticResult<RuntimeAnswer>>,
): Bundle {
  return useMemo(() => {
    const cells = Object.fromEntries(
      Object.entries(answers).map(([id, answer]) => {
        const input = normalizeMonitorInput(answer.semantic.input);
        return [
          id,
          {
            ...answer,
            reference: answer,
            id,
            input,
            fingerprint: fingerprint(input),
            dependencies: answer.semantic.dependencies.map(
              (d) => d.label ?? d.id,
            ),
            pass: answer.semantic.pass,
            ready: answer.semantic.status === "ready",
            status:
              answer.semantic.status === "pending"
                ? "dirty"
                : answer.semantic.status === "disabled"
                  ? "blocked"
                  : answer.semantic.status,
          } satisfies Cell,
        ];
      }),
    );
    return { cells, ready: Object.values(cells).every((c) => c.ready) };
  }, Object.values(answers));
}
function config(input: Input, key: string) {
  return {
    state: input,
    label: `${input.scopeId}.${key}`,
    question:
      groups[input.scopeId]!.questions[`${input.scopeId}.${key}`]!.instructions,
  };
}
function choiceOptions(input: Input, key: string) {
  return (
    groups[input.scopeId]!.questions[`${input.scopeId}.${key}`] as Extract<
      RuntimeQuestion,
      { type: "choice" }
    >
  ).criteria;
}
function scoreLevels(input: Input, key: string) {
  return (
    groups[input.scopeId]!.questions[`${input.scopeId}.${key}`] as Extract<
      RuntimeQuestion,
      { type: "score" }
    >
  ).criteria;
}
const options = { debounceMs: 60 };

export function useJapanWeatherSemantic(facts: WorldFacts) {
  const input = inputFor("jp.weather", facts);
  const severity = useScore(
    { ...config(input, "severity"), levels: scoreLevels(input, "severity") },
    options,
  );
  const urgency = useNoul(config(input, "urgency"), options);
  const trend = useChoice(
    { ...config(input, "trend"), options: choiceOptions(input, "trend") },
    options,
  );
  return {
    severity,
    urgency,
    trend,
    ...useBundle({
      "jp.weather.severity": severity,
      "jp.weather.urgency": urgency,
      "jp.weather.trend": trend,
    }),
  };
}
export function useJapanMarketSemantic(facts: WorldFacts) {
  const input = inputFor("jp.markets", facts);
  const stress = useScore(
    { ...config(input, "stress"), levels: scoreLevels(input, "stress") },
    options,
  );
  return { stress, ...useBundle({ "jp.markets.stress": stress }) };
}
/** US facts become shared meaning; no foreign observations are invented. */
export function useGlobalMarketSemantic(facts: WorldFacts) {
  const input = inputFor("global.markets", facts);
  const stress = useScore(
    {
      ...config(input, "stress"),
      levels: scoreLevels(input, "stress"),
    },
    options,
  );
  const trend = useChoice(
    {
      ...config(input, "trend"),
      options: choiceOptions(input, "trend"),
    },
    options,
  );
  return {
    stress,
    trend,
    ...useBundle({
      "global.markets.stress": stress,
      "global.markets.trend": trend,
    }),
  };
}

export type MarketExposure = Bundle & {
  attention: SemanticResult<NoulAnswer>;
  pressure: SemanticResult<ScoreAnswer>;
  trend: SemanticResult<ChoiceAnswer>;
};

export function useJapanNewsSemantic(facts: WorldFacts) {
  const input = inputFor("jp.news", facts);
  const signals = useChoice(
    { ...config(input, "signals"), options: choiceOptions(input, "signals") },
    options,
  );
  return { signals, ...useBundle({ "jp.news.signals": signals }) };
}
export function useEnergySemantic(facts: WorldFacts) {
  const input = inputFor("energy", facts);
  const risk = useScore(
    {
      ...config(input, "supplyRisk"),
      levels: scoreLevels(input, "supplyRisk"),
    },
    options,
  );
  const trend = useChoice(
    { ...config(input, "trend"), options: choiceOptions(input, "trend") },
    options,
  );
  return {
    risk,
    trend,
    ...useBundle({
      "energy.supplyRisk": risk,
      "energy.trend": trend,
    }),
  };
}
export function usePressureSemantic(
  id: "jp.imports" | "eu.energy" | "aviation.cost",
  facts: WorldFacts,
  energy: ReturnType<typeof useEnergySemantic>,
) {
  const input = inputFor(id, facts, {
    "energy.supplyRisk": energy.risk.select((a) => a.score),
    "energy.trend": energy.trend.select((a) => a.choice),
  });
  const pressure = useScore(
    { ...config(input, "pressure"), levels: scoreLevels(input, "pressure") },
    options,
  );
  return { pressure, ...useBundle({ [`${id}.pressure`]: pressure }) };
}
export function useJapanTransportSemantic(
  facts: WorldFacts,
  weather: ReturnType<typeof useJapanWeatherSemantic>,
  aviation: ReturnType<typeof usePressureSemantic>,
) {
  const input = inputFor("jp.transport", facts, {
    "jp.weather.severity": weather.severity.select((a) => a.score),
    "jp.weather.urgency": weather.urgency.select((a) => a.noul),
    "jp.weather.trend": weather.trend.select((a) => a.choice),
    "aviation.cost.pressure": aviation.pressure.select((a) => a.score),
  });
  const disruption = useScore(
    {
      ...config(input, "disruption"),
      levels: scoreLevels(input, "disruption"),
    },
    options,
  );
  const trend = useChoice(
    { ...config(input, "trend"), options: choiceOptions(input, "trend") },
    options,
  );
  return {
    disruption,
    trend,
    ...useBundle({
      "jp.transport.disruption": disruption,
      "jp.transport.trend": trend,
    }),
  };
}
export function useCountrySituation(
  id: PlaceId,
  facts: WorldFacts,
  inherited: Input["inherited"] = {},
) {
  const scope = places[id].scope,
    input = inputFor(scope, facts, inherited);
  const situation = useChoice(
    {
      ...config(input, "situation"),
      options: choiceOptions(input, "situation"),
    },
    options,
  );
  const severity = useScore(
    { ...config(input, "severity"), levels: scoreLevels(input, "severity") },
    options,
  );
  const urgency = useNoul(config(input, "urgency"), options);
  const trend = useChoice(
    { ...config(input, "trend"), options: choiceOptions(input, "trend") },
    options,
  );
  return {
    situation,
    severity,
    urgency,
    trend,
    ...useBundle({
      [`${scope}.situation`]: situation,
      [`${scope}.severity`]: severity,
      [`${scope}.urgency`]: urgency,
      [`${scope}.trend`]: trend,
    }),
  };
}
export function useJapanSituation(
  facts: WorldFacts,
  weather: ReturnType<typeof useJapanWeatherSemantic>,
  transport: ReturnType<typeof useJapanTransportSemantic>,
  markets: ReturnType<typeof useJapanMarketSemantic>,
  news: ReturnType<typeof useJapanNewsSemantic>,
  imports: ReturnType<typeof usePressureSemantic>,
  exposure: MarketExposure,
) {
  return useCountrySituation("jp", facts, {
    "jp.weather.severity": weather.severity.select((a) => a.score),
    "jp.weather.urgency": weather.urgency.select((a) => a.noul),
    "jp.transport.disruption": transport.disruption.select((a) => a.score),
    "jp.transport.trend": transport.trend.select((a) => a.choice),
    "jp.weather.trend": weather.trend.select((a) => a.choice),
    "jp.markets.stress": markets.stress.select((a) => a.score),
    "jp.news.signals": news.signals.select((a) => a.choice),
    "jp.imports.pressure": imports.pressure.select((a) => a.score),
    "jp.spillover.pressure": exposure.pressure.select((a) => a.score),
    "jp.spillover.trend": exposure.trend.select((a) => a.choice),
  });
}
export function useRegionalAttention(
  id: "region:asia" | "global",
  facts: WorldFacts,
  inherited: Input["inherited"],
) {
  const input = inputFor(id, facts, inherited);
  const attention = useChoice(
    {
      ...config(input, "attention"),
      options: choiceOptions(input, "attention"),
    },
    options,
  );
  const theme = useChoice(
    { ...config(input, "theme"), options: choiceOptions(input, "theme") },
    options,
  );
  return {
    attention,
    theme,
    ...useBundle({
      [`${id}.attention`]: attention,
      [`${id}.theme`]: theme,
    }),
  };
}
/** Ordinary hook composition is the graph. Selection is deliberately not an input. */
export function useWorldSemanticGraph(
  facts: WorldFacts,
  globalMarkets: ReturnType<typeof useGlobalMarketSemantic>,
  japanExposure: MarketExposure,
  europeExposure: MarketExposure,
) {
  const weather = useJapanWeatherSemantic(facts);
  const markets = useJapanMarketSemantic(facts);
  const news = useJapanNewsSemantic(facts);
  const energy = useEnergySemantic(facts);
  const imports = usePressureSemantic("jp.imports", facts, energy);
  const europeEnergy = usePressureSemantic("eu.energy", facts, energy);
  const aviation = usePressureSemantic("aviation.cost", facts, energy);
  const transport = useJapanTransportSemantic(facts, weather, aviation);
  const japan = useJapanSituation(
    facts,
    weather,
    transport,
    markets,
    news,
    imports,
    japanExposure,
  );
  const korea = useCountrySituation("kr", facts);
  const china = useCountrySituation("cn", facts);
  const america = useCountrySituation("us", facts);
  const europe = useCountrySituation("eu", facts, {
    "eu.energy.pressure": europeEnergy.pressure.select((a) => a.score),
    "eu.spillover.pressure": europeExposure.pressure.select((a) => a.score),
    "eu.spillover.trend": europeExposure.trend.select((a) => a.choice),
  });
  const middleEast = useCountrySituation("me", facts);
  const asia = useRegionalAttention("region:asia", facts, {
    "country:jp.situation": japan.situation.select((a) => a.choice),
    "country:jp.severity": japan.severity.select((a) => a.score),
    "country:jp.trend": japan.trend.select((a) => a.choice),
    "country:jp.urgency": japan.urgency.select((a) => a.noul),
    "country:kr.situation": korea.situation.select((a) => a.choice),
    "country:kr.severity": korea.severity.select((a) => a.score),
    "country:kr.trend": korea.trend.select((a) => a.choice),
    "country:kr.urgency": korea.urgency.select((a) => a.noul),
    "country:cn.situation": china.situation.select((a) => a.choice),
    "country:cn.severity": china.severity.select((a) => a.score),
    "country:cn.trend": china.trend.select((a) => a.choice),
    "country:cn.urgency": china.urgency.select((a) => a.noul),
  });
  const global = useRegionalAttention("global", facts, {
    "region:asia.attention": asia.attention.select((a) => a.choice),
    "region:asia.theme": asia.theme.select((a) => a.choice),
    "country:us.situation": america.situation.select((a) => a.choice),
    "country:us.severity": america.severity.select((a) => a.score),
    "country:us.trend": america.trend.select((a) => a.choice),
    "country:us.urgency": america.urgency.select((a) => a.noul),
    "region:europe.situation": europe.situation.select((a) => a.choice),
    "region:europe.severity": europe.severity.select((a) => a.score),
    "region:europe.trend": europe.trend.select((a) => a.choice),
    "region:europe.urgency": europe.urgency.select((a) => a.noul),
    "region:middle-east.situation": middleEast.situation.select(
      (a) => a.choice,
    ),
    "region:middle-east.severity": middleEast.severity.select((a) => a.score),
    "region:middle-east.trend": middleEast.trend.select((a) => a.choice),
    "region:middle-east.urgency": middleEast.urgency.select((a) => a.noul),
  });
  const bundles = [
    globalMarkets,
    japanExposure,
    europeExposure,
    weather,
    markets,
    news,
    energy,
    imports,
    europeEnergy,
    aviation,
    transport,
    japan,
    korea,
    china,
    america,
    europe,
    middleEast,
    asia,
    global,
  ];
  return useMemo(
    () =>
      Object.assign({}, ...bundles.map((b) => b.cells)) as Record<string, Cell>,
    bundles.map((b) => b.cells),
  );
}
