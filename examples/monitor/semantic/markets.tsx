import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  SemanticScope,
  useAmbient,
  useChoice,
  useScore,
  type SemanticResult,
} from "../../../src/react/index.js";
import type {
  ScoreAnswer,
  ChoiceAnswer,
  NoulAnswer,
} from "../../../src/types.js";
import { useFacts } from "../events/provider.js";
import { groups, levels, trendOptions, marketExposure } from "./contract.js";
import {
  useBundle,
  useGlobalMarketSemantic,
  type MarketExposure,
} from "./hooks.js";

import { useMarketAttention } from "./attention.js";

type GlobalMarket = ReturnType<typeof useGlobalMarketSemantic>;
type LocalMarket = MarketExposure;
type Country = "jp" | "eu";
type Publish = (country: Country, result: LocalMarket | undefined) => void;
const PublicationContext = createContext<Publish | null>(null);

/** The original hook references cross the scope, never spread inspector cells. */
export function MarketScope({ children }: { children: ReactNode }) {
  const facts = useFacts((world) => world);
  const market = useGlobalMarketSemantic(facts);
  return (
    <SemanticScope
      values={{ pressure: market.stress, marketTrend: market.trend }}
    >
      {children}
    </SemanticScope>
  );
}

/** Two sibling instances interpret one shared signal against their own facts. */
export function MarketCountry({ country }: { country: Country }) {
  const pressure = useAmbient<SemanticResult<ScoreAnswer>>("pressure")!;
  const marketTrend = useAmbient<SemanticResult<ChoiceAnswer>>("marketTrend")!;
  const state = useExposureInput(country, pressure, marketTrend);
  const questions = groups[state.scopeId]!.questions;
  const localPressure = useScore(
    {
      state,
      question: questions[`${state.scopeId}.pressure`]!.instructions,
      levels,
      label: `${state.scopeId}.pressure`,
    },
    { debounceMs: 60 },
  );
  const trend = useChoice(
    {
      state,
      question: questions[`${state.scopeId}.trend`]!.instructions,
      options: trendOptions,
      label: `${state.scopeId}.trend`,
    },
    { debounceMs: 60 },
  );
  const attention = useMarketAttention(marketExposure[country]);
  usePublishCountry(country, localPressure, trend, attention);
  return null;
}

/** Protocol projection: local facts + live semantic references, no scheduling. */
function useExposureInput(
  country: Country,
  pressure: SemanticResult<ScoreAnswer>,
  trend: SemanticResult<ChoiceAnswer>,
) {
  const slice = useFacts((world) => world.countries[country].markets);
  return {
    kind: "market-exposure",
    scopeId: `${country}.spillover`,
    facts: { exposure: marketExposure[country], slice },
    inherited: {
      "global.markets.stress": pressure.select((answer) => answer.score),
      "global.markets.trend": trend.select((answer) => answer.choice),
    },
  };
}

function usePublishCountry(
  country: Country,
  pressure: SemanticResult<ScoreAnswer>,
  trend: SemanticResult<ChoiceAnswer>,
  attention: SemanticResult<NoulAnswer>,
) {
  const publish = useContext(PublicationContext)!;
  const bundle = useBundle({
    [`${country}.spillover.pressure`]: pressure,
    [`${country}.spillover.trend`]: trend,
    [`${country}.attention.urgent`]: attention,
  });
  const result = useMemo(
    () => ({ pressure, trend, attention, ...bundle }),
    [pressure, trend, attention, bundle],
  );
  // Publish committed references for cross-branch aggregation and inspection.
  // This bridge never calls the adapter, interprets readiness, or schedules work.
  useLayoutEffect(() => {
    publish(country, result);
  }, [publish, country, result]);
  useLayoutEffect(() => () => publish(country, undefined), [publish, country]);
}

/** The two country components stay mounted regardless of map/inspector selection. */
export function MarketComposition({
  children,
}: {
  children: (
    global: GlobalMarket,
    japan: LocalMarket,
    europe: LocalMarket,
  ) => ReactNode;
}) {
  const stress = useAmbient<SemanticResult<ScoreAnswer>>("pressure")!;
  const trend = useAmbient<SemanticResult<ChoiceAnswer>>("marketTrend")!;
  const bundle = useBundle({
    "global.markets.stress": stress,
    "global.markets.trend": trend,
  });
  const global = useMemo(
    () => ({ stress, trend, ...bundle }),
    [stress, trend, bundle],
  );
  const [countries, setCountries] = useState<
    Partial<Record<Country, LocalMarket>>
  >({});
  const publish = useMemo<Publish>(
    () => (country, result) => {
      setCountries((previous) =>
        previous[country] === result
          ? previous
          : { ...previous, [country]: result },
      );
    },
    [],
  );
  return (
    <PublicationContext.Provider value={publish}>
      <MarketCountry country="jp" />
      <MarketCountry country="eu" />
      {countries.jp &&
        countries.eu &&
        children(global, countries.jp, countries.eu)}
    </PublicationContext.Provider>
  );
}
