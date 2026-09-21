import { z } from "zod";
import type { JsonValue, RuntimeQuestion } from "../../../src/types.js";
import {
  places,
  placeIds,
  weatherSchema,
  transportSchema,
  marketsSchema,
  newsSchema,
  type PlaceId,
  type FactSlice,
  type WorldFacts,
} from "../events/model.js";
export const levels = [
  "Normal; no material disruption in the supplied evidence",
  "Elevated pressure; limited or localized disruption",
  "Significant disruption across an important system",
  "Severe disruption; sustained widespread loss of normal function",
] as const;
export const trendOptions = {
  improving:
    "Recent evidence is easing relative to the explicitly supplied history",
  stable: "Little material change relative to recent evidence",
  deteriorating: "Recent evidence shows increasing disruption or pressure",
  unclear: "Insufficient or conflicting history to establish direction",
};
export const situationOptions = {
  normal: "No material disruption in the supplied evidence",
  weather: "Weather is the dominant cause of current disruption",
  transport:
    "Transport operations dominate, without weather as the primary cause",
  economic: "Markets, costs, supply or household economic pressure dominate",
  security: "Explicit security observations dominate",
  infrastructure: "Infrastructure outages dominate",
  mixed: "Two or more independent domains have similarly material disruption",
};
const choice = (
  instructions: string,
  criteria: Record<string, string>,
): RuntimeQuestion => ({ type: "choice", instructions, criteria });
const score = (instructions: string): RuntimeQuestion => ({
  type: "score",
  instructions,
  criteria: levels,
});
const noul = (instructions: string): RuntimeQuestion => ({
  type: "noul",
  instructions,
});
export type Kind =
  | "weather"
  | "transport"
  | "market"
  | "news"
  | "energy"
  | "pressure"
  | "market-spillover"
  | "market-attention"
  | "market-exposure"
  | "country"
  | "aggregate";
export type Group = {
  id: string;
  kind: Kind;
  label: string;
  scope: string;
  dependencies: string[];
  facts: string[];
  questions: Record<string, RuntimeQuestion>;
  consumers: string[];
};
const groups: Record<string, Group> = {};
function define(
  id: string,
  kind: Kind,
  label: string,
  scope: string,
  dependencies: string[],
  facts: string[],
  definitions: Record<string, RuntimeQuestion>,
  consumers: string[],
) {
  groups[id] = {
    id,
    kind,
    label,
    scope,
    dependencies,
    facts,
    questions: Object.fromEntries(
      Object.entries(definitions).map(([key, q]) => [`${id}.${key}`, q]),
    ),
    consumers: [
      ...new Set([
        ...consumers,
        ...(kind === "country" ||
        [
          "global.markets",
          "jp.spillover",
          "eu.spillover",
          "jp.weather",
          "jp.transport",
          "energy",
          "jp.imports",
          "eu.energy",
          "aviation.cost",
          "region:asia",
          "global",
        ].includes(id)
          ? ["WorldAtlas"]
          : []),
      ]),
    ],
  };
}
define(
  "jp.weather",
  "weather",
  "Japan weather",
  "country:jp",
  [],
  ["jp.weather"],
  {
    severity: score(
      "How disruptive are current Japan weather conditions? Interpret official warning codes (0 none to 5 highest), wind and rain as observations, not automatic truth about impacts.",
    ),
    urgency: noul(
      "Do these weather observations warrant immediate operational attention within the monitored Japan scope?",
    ),
    trend: choice(
      "How are Japan weather conditions evolving? Compare current observations with the explicit previous snapshots; do not assume memory.",
      trendOptions,
    ),
  },
  [
    "FocusInspector",
    "useJapanTransportSemantic",
    "useJapanSituation",
    "DevInspector",
  ],
);
define(
  "jp.markets",
  "market",
  "Japan markets",
  "country:jp",
  [],
  ["jp.markets"],
  {
    stress: score(
      "How much market stress is supported by the index change and volatility observations in Japan?",
    ),
  },
  ["useJapanSituation", "PropagationGraph"],
);
define(
  "jp.news",
  "news",
  "Japan notices",
  "country:jp",
  [],
  ["jp.news"],
  {
    signals: choice(
      "What bounded operational signal is supported by these notices? Do not invent events.",
      {
        none: "No material notice",
        infrastructure: "Infrastructure outage is reported",
        security: "Restrictions affecting safety or access are reported",
        support: "A support response or restoration is reported",
      },
    ),
  },
  ["useJapanSituation", "DevInspector"],
);
define(
  "energy",
  "energy",
  "Energy supply",
  "domain:energy",
  [],
  ["me.news", "me.markets", "me.transport"],
  {
    supplyRisk: score(
      "What supply pressure is supported by the capacity offline, oil move and shipping-delay evidence? This is a limited scenario interpretation, not a forecast of global risk.",
    ),
    trend: choice(
      "Is the supplied energy situation improving or deteriorating relative to explicit observation history?",
      trendOptions,
    ),
  },
  [
    "usePressureSemantic (Japan)",
    "usePressureSemantic (Europe)",
    "usePressureSemantic (aviation)",
    "PropagationGraph",
  ],
);
for (const [id, label, scope, fact] of [
  ["jp.imports", "Japan import pressure", "country:jp", "jp.markets"],
  ["eu.energy", "Europe energy pressure", "region:europe", "eu.markets"],
  [
    "aviation.cost",
    "Aviation cost pressure",
    "domain:aviation",
    "jp.transport",
  ],
])
  define(
    id!,
    "pressure",
    label!,
    scope!,
    ["energy.supplyRisk", "energy.trend"],
    [fact!],
    {
      pressure: score(
        `Given the inherited energy interpretation and this scope's explicit exposure, how significant is ${label!.toLowerCase()}? Do not infer actual cancellations from cost pressure.`,
      ),
    },
    [
      id === "jp.imports"
        ? "useJapanSituation"
        : id === "eu.energy"
          ? "useCountrySituation (Europe)"
          : "useJapanTransportSemantic",
      "PropagationGraph",
    ],
  );
define(
  "jp.transport",
  "transport",
  "Japan transport",
  "country:jp",
  [
    "jp.weather.severity",
    "jp.weather.urgency",
    "jp.weather.trend",
    "aviation.cost.pressure",
  ],
  ["jp.transport"],
  {
    disruption: score(
      "Interpret observed flight cancellations, delays and rail warnings alongside weather meaning and aviation cost pressure. Distinguish actual operational disruption from anticipated pressure.",
    ),
    trend: choice(
      "How is transport disruption evolving? Use supplied previous observations and current inherited weather meaning, never memory of prior requests.",
      trendOptions,
    ),
  },
  ["useJapanSituation", "FocusInspector", "PropagationGraph"],
);
// These are explicit fictional scenario assumptions, not measured economic exposures.
export const marketExposure = { jp: 0.85, eu: 0.55 } as const;
define(
  "global.markets",
  "market-spillover",
  "US market spillover",
  "global",
  [],
  ["us.markets"],
  {
    stress: score(
      "How much international market pressure could the supplied US index move and volatility create? Interpret potential spillover, not observed losses abroad. No other country's market observations have changed.",
    ),
    trend: choice(
      "How is US-origin market pressure evolving relative to the explicit observation history?",
      trendOptions,
    ),
  },
  ["MarketCountry (Japan)", "MarketCountry (Europe)", "FocusInspector"],
);
for (const id of ["jp", "eu"] as const)
  define(
    `${id}.spillover`,
    "market-exposure",
    `${places[id].name} market exposure`,
    places[id].scope,
    ["global.markets.stress", "global.markets.trend"],
    [`${id}.markets`],
    {
      pressure: score(
        `How much potential economic pressure reaches ${places[id].name} through its explicit scenario exposure to US markets (0 insulated, 1 fully exposed)? Combine upstream pressure with local observations. This is an interpretation of exposure, not evidence of a local market drop.`,
      ),
      trend: choice(
        "How is this scope's inherited market pressure evolving? Use the upstream trend and explicit local history.",
        trendOptions,
      ),
    },
    [
      id === "jp" ? "useJapanSituation" : "useCountrySituation (Europe)",
      "FocusInspector",
      "PropagationGraph",
    ],
  );
export const attentionQuestion =
  "Does this region need immediate operator attention? Interpret the supplied shared economic pressure (0 normal to 3 severe) and the region's fixed exposure (0 insulated to 1 fully exposed). No local market movement is implied.";
for (const country of ["jp", "eu"] as const)
  define(
    `${country}.attention`,
    "market-attention",
    `${places[country].name} attention`,
    places[country].scope,
    ["global.markets.stress"],
    [],
    { urgent: noul(attentionQuestion) },
    ["RegionConsequence", "AttentionStatus", "CausalStory"],
  );

/** Demo wire projection only. The SDK has already discovered and resolved references. */
export function normalizeMonitorInput(state: unknown): MonitorInput {
  const input = state as Record<string, unknown>;
  if (
    input &&
    !Object.hasOwn(input, "scopeId") &&
    Object.keys(input).sort().join() === "exposure,pressure"
  ) {
    const country =
      input.exposure === marketExposure.jp
        ? "jp"
        : input.exposure === marketExposure.eu
          ? "eu"
          : undefined;
    if (!country) throw new Error("Unknown demo exposure");
    return {
      kind: "market-attention",
      scopeId: `${country}.attention`,
      facts: { exposure: input.exposure as number },
      inherited: { "global.markets.stress": input.pressure as number },
    };
  }
  return state as MonitorInput;
}
for (const id of placeIds) {
  const p = places[id];
  define(
    p.scope,
    "country",
    p.name,
    p.scope,
    id === "jp"
      ? [
          "jp.weather.severity",
          "jp.weather.urgency",
          "jp.weather.trend",
          "jp.transport.disruption",
          "jp.transport.trend",
          "jp.markets.stress",
          "jp.news.signals",
          "jp.imports.pressure",
          "jp.spillover.pressure",
          "jp.spillover.trend",
        ]
      : id === "eu"
        ? ["eu.energy.pressure", "eu.spillover.pressure", "eu.spillover.trend"]
        : [],
    id === "jp"
      ? []
      : ["weather", "transport", "markets", "news"].map((d) => `${id}.${d}`),
    {
      situation: choice(
        `What best characterizes ${p.name}'s monitored situation? Use only supplied observations and inherited typed interpretations. A weather-caused transport disruption remains weather; economic supply pressure can propagate without a local incident.`,
        situationOptions,
      ),
      urgency: noul(
        `Does ${p.name}'s current monitored situation warrant immediate operator attention? This is interpretation, not notification policy.`,
      ),
      severity: score(
        `How significant is overall disruption within ${p.name}'s monitored situation?`,
      ),
      trend: choice(
        `How is ${p.name}'s situation evolving? Compare explicit recent evidence and upstream trend answers.`,
        trendOptions,
      ),
    },
    [
      "SemanticNode",
      "FocusInspector",
      "DevInspector",
      "SemanticNode",
      id === "jp" || id === "kr" || id === "cn"
        ? "useRegionalAttention (Asia)"
        : "useRegionalAttention (World)",
      "Timeline",
    ],
  );
}
const attention = {
  normal: "No materially elevated attention within the monitored scopes",
  elevated: "One or more monitored scopes warrant closer attention",
  high: "Severe or multiple significant monitored situations warrant sustained attention",
};
const themes = {
  normal: "No active dominant theme",
  weather: "Weather-driven disruption dominates",
  markets: "Economic or market pressure dominates",
  transport: "Transport disruption dominates",
  security: "Security or infrastructure notices dominate",
  mixed: "Multiple themes of comparable importance",
};
const summaryKeys = (scope: string) =>
  ["situation", "severity", "urgency", "trend"].map((key) => `${scope}.${key}`);
define(
  "region:asia",
  "aggregate",
  "Asia attention",
  "region:asia",
  ["jp", "kr", "cn"].flatMap((id) => summaryKeys(places[id as PlaceId].scope)),
  [],
  {
    attention: choice(
      "What level of operator attention is warranted across the monitored Asian scopes? This covers Japan, South Korea and China only.",
      attention,
    ),
    theme: choice(
      "Which theme dominates the supplied monitored Asian situations?",
      themes,
    ),
  },
  ["useRegionalAttention (World)", "PropagationGraph", "DevInspector"],
);
define(
  "global",
  "aggregate",
  "World attention",
  "global",
  [
    "region:asia.attention",
    "region:asia.theme",
    ...["us", "eu", "me"].flatMap((id) =>
      summaryKeys(places[id as PlaceId].scope),
    ),
  ],
  [],
  {
    attention: choice(
      "What level of attention is warranted over these six monitored geographies? Do not imply this is objective worldwide risk or that unmonitored places are safe.",
      attention,
    ),
    theme: choice("What theme dominates this limited world monitor?", themes),
  },
  ["SemanticNode", "WorldMap", "Timeline", "PropagationGraph"],
);
export { groups };
export const nodeIds = Object.values(groups).flatMap((g) =>
  Object.keys(g.questions),
);
export const groupForNode = (node: string): Group =>
  Object.values(groups).find((g) => Object.hasOwn(g.questions, node))!;
export function depth(group: Group): number {
  return group.dependencies.length
    ? 1 + Math.max(...group.dependencies.map((id) => depth(groupForNode(id))))
    : 1;
}
export type MonitorInput = {
  kind: Kind;
  scopeId: string;
  facts: Record<string, JsonValue>;
  inherited: Record<string, string | number>;
};
export function questionsFor(groupId: string, ids?: readonly string[]) {
  const allowed = groups[groupId]?.questions;
  if (!allowed) throw new Error("Unknown monitor group");
  return Object.fromEntries(
    [...(ids ?? Object.keys(allowed))].sort().map((id) => {
      if (!Object.hasOwn(allowed, id))
        throw new Error("Unknown monitor judgment");
      return [id, allowed[id]!];
    }),
  );
}
const evidence = z
  .object({
    eventId: z.string().regex(/^[a-z0-9:-]{1,80}$/),
    sourceId: z.string().max(40),
    timestamp: z.iso.datetime(),
  })
  .strict();
const factSlice = (values: z.ZodType) =>
  z
    .object({
      current: values,
      history: z
        .array(z.object({ timestamp: z.iso.datetime(), values }).strict())
        .max(3),
      provenance: z.record(z.string().max(40), evidence),
      eventIds: z.array(z.string().max(80)).max(8),
    })
    .strict();
const fuel = factSlice(
  z.object({ fuelSurchargePct: z.number().min(0).max(100) }).strict(),
);
const weather = factSlice(weatherSchema),
  transport = factSlice(transportSchema),
  markets = factSlice(marketsSchema),
  news = factSlice(newsSchema);
const countryFacts = z.object({ weather, transport, markets, news }).strict();
function factsSchema(g: Group): z.ZodType {
  if (g.kind === "weather") return z.object({ slice: weather }).strict();
  if (g.kind === "transport") return z.object({ slice: transport }).strict();
  if (g.kind === "market-attention")
    return z
      .object({
        exposure: z.literal(
          marketExposure[g.id === "jp.attention" ? "jp" : "eu"],
        ),
      })
      .strict();
  if (g.kind === "market-exposure")
    return z
      .object({
        exposure: z.literal(
          marketExposure[g.id === "jp.spillover" ? "jp" : "eu"],
        ),
        slice: markets,
      })
      .strict();
  if (g.kind === "market-spillover")
    return z.object({ slice: markets }).strict();
  if (g.kind === "market") return z.object({ slice: markets }).strict();
  if (g.kind === "news") return z.object({ slice: news }).strict();
  if (g.kind === "energy")
    return z.object({ news, markets, transport }).strict();
  if (g.kind === "pressure")
    return z
      .object({
        exposure: z.enum([
          "import_dependent",
          "regional_energy",
          "aviation_fuel",
        ]),
        slice: g.id === "aviation.cost" ? fuel : markets,
      })
      .strict();
  if (g.kind === "country" && g.id !== "country:jp") return countryFacts;
  return z.object({}).strict();
}
export const monitorRequestSchema = z
  .object({
    input: z
      .object({
        kind: z.enum([
          "weather",
          "transport",
          "market",
          "news",
          "energy",
          "pressure",
          "market-spillover",
          "market-exposure",
          "market-attention",
          "country",
          "aggregate",
        ]),
        scopeId: z.string().max(80),
        facts: z.record(z.string(), z.unknown()),
        inherited: z.record(
          z.string(),
          z.union([z.string().max(30), z.number().finite()]),
        ),
      })
      .strict(),
    ids: z.array(z.string().max(90)).min(1).max(4),
  })
  .strict()
  .superRefine((body, ctx) => {
    const g = groups[body.input.scopeId];
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!g || g.kind !== body.input.kind) return fail("Unknown monitor scope");
    if (
      new Set(body.ids).size !== body.ids.length ||
      body.ids.some((id) => !Object.hasOwn(g.questions, id))
    )
      fail("Only fixed monitor questions are accepted");
    if (!factsSchema(g).safeParse(body.input.facts).success)
      fail("Invalid focused facts");
    if (
      Object.keys(body.input.inherited).sort().join() !==
      [...g.dependencies].sort().join()
    )
      fail("Expected exact declared dependencies");
    for (const [id, value] of Object.entries(body.input.inherited)) {
      const q = groupForNode(id)?.questions[id];
      if (
        !q ||
        (q.type === "choice"
          ? typeof value !== "string" || !Object.hasOwn(q.criteria, value)
          : typeof value !== "number" ||
            value < 0 ||
            value > (q.type === "noul" ? 1 : q.criteria.length - 1))
      )
        fail("Invalid inherited semantic value");
    }
  })
  .transform((body) => ({ ...body, input: body.input as MonitorInput }));
function projectSlice(slice: FactSlice, keys: string[]): FactSlice {
  const pick = (values: Record<string, string | number>) =>
    Object.fromEntries(keys.map((key) => [key, values[key]!]));
  const provenance = Object.fromEntries(
    keys.map((key) => [key, slice.provenance[key]!]),
  );
  // Only observations of these fields are dependencies; unrelated transport reports disappear.
  const current = pick(slice.current);
  const previous = slice.history.map((h) => ({ ...h, values: pick(h.values) }));
  const history = previous.filter(
    (h, i) =>
      JSON.stringify(h.values) !==
      JSON.stringify(previous[i + 1]?.values ?? current),
  );
  return {
    current,
    provenance,
    history,
    eventIds: [
      ...new Set(Object.values(provenance).map((p) => p.eventId)),
    ].filter((id) => id !== "seed"),
  };
}
export function projectFacts(
  g: Group,
  world: WorldFacts,
): Record<string, JsonValue> {
  const get = (path: string) => {
    const [id, domain] = path.split(".");
    return world.countries[id as PlaceId][
      domain as keyof typeof world.countries.jp
    ];
  };
  let facts: unknown;
  if (
    ["weather", "transport", "market", "news", "market-spillover"].includes(
      g.kind,
    )
  )
    facts = { slice: get(g.facts[0]!) };
  else if (g.kind === "market-attention")
    facts = { exposure: marketExposure[g.id === "jp.attention" ? "jp" : "eu"] };
  else if (g.kind === "market-exposure")
    facts = {
      exposure: marketExposure[g.id === "jp.spillover" ? "jp" : "eu"],
      slice: get(g.facts[0]!),
    };
  else if (g.kind === "energy")
    facts = {
      news: world.countries.me.news,
      markets: world.countries.me.markets,
      transport: world.countries.me.transport,
    };
  else if (g.kind === "pressure")
    facts = {
      exposure:
        g.id === "jp.imports"
          ? "import_dependent"
          : g.id === "eu.energy"
            ? "regional_energy"
            : "aviation_fuel",
      slice:
        g.id === "aviation.cost"
          ? projectSlice(get(g.facts[0]!), ["fuelSurchargePct"])
          : get(g.facts[0]!),
    };
  else if (g.kind === "country" && g.id !== "country:jp")
    facts = world.countries[placeIds.find((id) => places[id].scope === g.id)!];
  else facts = {};
  return facts as Record<string, JsonValue>;
}
export function evidenceIds(input: MonitorInput): string[] {
  const ids = new Set<string>();
  const visit = (v: unknown) => {
    if (v && typeof v === "object") {
      if ("eventIds" in v)
        for (const id of (v as FactSlice).eventIds) ids.add(id);
      else Object.values(v).forEach(visit);
    }
  };
  visit(input.facts);
  return [...ids];
}
