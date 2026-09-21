import { z } from "zod";
import type { JsonValue, RuntimeQuestion } from "../../../src/types.js";
import type { VillageState, DistrictId } from "../simulation/world.js";
import { districtIds, householdSeeds } from "../simulation/world.js";

export type ScopeKind = "village" | "district" | "family" | "person";
export type SemanticInput = {
  kind: ScopeKind;
  scopeId: string;
  facts: Record<string, JsonValue>;
  inherited: Record<string, JsonValue>;
};
const choice = <T extends Record<string, string>>(
  instructions: string,
  criteria: T,
) => ({ type: "choice" as const, instructions, criteria });
export const questions = {
  village: {
    "village.mood": choice(
      "What best describes the village's current social mood? Interpret the supplied facts, not a preferred storyline.",
      {
        hopeful: "People broadly believe conditions are improving.",
        stable: "People feel relatively secure and normal.",
        anxious: "Widespread concern about what may happen next.",
        angry:
          "Widespread resentment toward current conditions and leadership.",
        desperate: "Basic needs and social order are under severe pressure.",
      },
    ),
    "village.concern": choice(
      "What is the single dominant concern across this village right now?",
      {
        food: "Food availability and hunger.",
        safety: "Crime and personal security.",
        money: "Taxes, prices and livelihoods.",
        disease: "Illness and health threats.",
        outsiders: "Integration of new arrivals.",
        none: "No concern dominates ordinary life.",
      },
    ),
    "village.trust": {
      type: "score",
      instructions:
        "How much trust do residents have in the village council, given material conditions and recent actions?",
      criteria: [
        "Very little trust; leadership is failing residents",
        "Mixed or fragile trust; meaningful doubts",
        "Strong trust; leadership is meeting residents' needs",
      ],
    },
  },
  district: {
    "district.mood": choice(
      "Given inherited village meaning and this district's facts, what best describes its local mood? Local conditions may diverge from the village.",
      {
        calm: "Normal routines and relative security.",
        uneasy: "Unsettled by local or wider pressures.",
        angry: "Local resentment and frustration.",
        optimistic: "Local conditions support optimism.",
      },
    ),
    "district.pressure": choice(
      "What most strongly pressures this district right now?",
      {
        prices: "High food or market prices.",
        crime: "Theft or poor security.",
        trade: "Declining trade and closed stalls.",
        labor: "Too few workers for local needs.",
        food: "Local supplies are running short.",
        none: "No significant local pressure.",
      },
    ),
  },
  family: {
    "family.stability": choice(
      "How secure is this household, given its finances, food reserves and inherited district context?",
      {
        stable: "Resources cover ordinary needs.",
        strained: "Needs are covered with pressure or tradeoffs.",
        precarious: "Basic needs are at immediate risk.",
      },
    ),
    "family.grievance": choice(
      "What is this family's main grievance toward current conditions?",
      {
        money: "Financial strain or income losses.",
        food: "Insufficient household food.",
        safety: "Unsafe surroundings.",
        none: "No substantial grievance.",
      },
    ),
  },
  person: {
    "person.attitude": choice(
      "What is this person's likely attitude toward the village council, given personal facts, witnessed events and inherited meaning?",
      {
        supportive: "Council actions benefit this resident.",
        neutral: "Neither supportive nor critical.",
        skeptical: "Doubts about the council's choices.",
        hostile: "Strong resentment toward the council.",
      },
    ),
    "person.secure": {
      type: "noul",
      instructions:
        "Does this person currently feel that their basic material needs and personal safety are secure, given personal and inherited context?",
    },
  },
} as const satisfies Record<ScopeKind, Record<string, RuntimeQuestion>>;
export const semanticKeys = Object.values(questions).flatMap((value) =>
  Object.keys(value),
);
export const dependencies: Record<ScopeKind, string[]> = {
  village: [
    "facts.foodSupply",
    "facts.taxRate",
    "facts.treasury",
    "facts.crime",
    "facts.trade",
    "facts.population",
    "facts.guards",
    "facts.rationing",
    "facts.marketOpen",
    "facts.events",
  ],
  district: [
    "village.mood",
    "village.concern",
    "village.trust",
    "district facts",
  ],
  family: [
    "village.mood",
    "village.concern",
    "village.trust",
    "district.mood",
    "district.pressure",
    "family facts",
  ],
  person: [
    "village.mood",
    "village.concern",
    "village.trust",
    "district.mood",
    "district.pressure",
    "family.stability",
    "family.grievance",
    "person facts",
    "witnessed events",
  ],
};
export const passFor: Record<ScopeKind, number> = {
  village: 1,
  district: 2,
  family: 3,
  person: 4,
};
const percent = z.number().finite().min(0).max(100);
const funds = z.number().finite().min(0).max(10000);
const event = z
  .object({
    type: z.enum([
      "tax_changed",
      "food_distributed",
      "grain_rationed",
      "guards_hired",
      "theft",
      "theft_ignored",
      "crime_punished",
      "refugees_arrived",
      "farm_investment",
      "market_changed",
      "harvest_failed",
    ]),
    previous: z.number().finite().min(0).max(10000),
    next: z.number().finite().min(0).max(10000),
    districtId: z.enum(["village", ...districtIds]),
  })
  .strict();
const villageInherited = {
  "village.mood": z.enum([
    "hopeful",
    "stable",
    "anxious",
    "angry",
    "desperate",
  ]),
  "village.concern": z.enum([
    "food",
    "safety",
    "money",
    "disease",
    "outsiders",
    "none",
  ]),
  "village.trust": z.number().min(0).max(2),
};
const districtInherited = {
  ...villageInherited,
  "district.mood": z.enum(["calm", "uneasy", "angry", "optimistic"]),
  "district.pressure": z.enum([
    "prices",
    "crime",
    "trade",
    "labor",
    "food",
    "none",
  ]),
};
const familyInherited = {
  ...districtInherited,
  "family.stability": z.enum(["stable", "strained", "precarious"]),
  "family.grievance": z.enum(["money", "food", "safety", "none"]),
};
export const semanticInputSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("village"),
        scopeId: z.literal("village"),
        inherited: z.object({}).strict(),
        facts: z
          .object({
            foodSupply: percent,
            treasury: funds,
            taxRate: z.number().min(0).max(0.6),
            crime: z.number().min(0).max(1),
            trade: percent,
            population: z.number().int().min(0).max(90),
            guards: z.number().int().min(0).max(10000),
            rationing: z.boolean(),
            marketOpen: z.boolean(),
            events: z.array(event).max(8),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("district"),
        scopeId: z.string().max(40),
        inherited: z.object(villageInherited).strict(),
        facts: z
          .object({
            prices: z.number().min(0.7).max(3),
            openStalls: z.number().int().min(0).max(7),
            totalStalls: z.number().int().min(0).max(7),
            tradeVolume: percent,
            foodStock: percent,
            workers: z.number().int().min(0).max(100),
            incidentCount: z.number().int().min(0).max(10000),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("family"),
        scopeId: z.string().max(40),
        inherited: z.object(districtInherited).strict(),
        facts: z
          .object({
            savings: funds,
            foodDays: z.number().min(0).max(20),
            dependents: z.number().int().min(0).max(20),
            incomeDelta: z.number().min(-10000).max(10000),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("person"),
        scopeId: z.string().max(40),
        inherited: z.object(familyInherited).strict(),
        facts: z
          .object({
            occupation: z.enum([
              "merchant",
              "baker",
              "farmer",
              "dockworker",
              "guard",
              "healer",
              "weaver",
              "child",
              "elder",
            ]),
            wealth: funds,
            hunger: percent,
            health: percent,
            recentIncomeDelta: z.number().min(-10000).max(10000),
            witnessedEvents: z.array(event).max(5),
          })
          .strict(),
      })
      .strict(),
  ])
  .superRefine((input, ctx) => {
    const valid =
      input.kind === "village"
        ? ["village"]
        : input.kind === "district"
          ? districtIds.map((id) => `district:${id}`)
          : input.kind === "family"
            ? householdSeeds.map((f) => `family:${f.id}`)
            : householdSeeds.flatMap((f) =>
                f.people.map((p) => `person:${p[0]}`),
              );
    if (!valid.includes(input.scopeId))
      ctx.addIssue({ code: "custom", message: "Unknown village scope" });
  });
export const villageRequestSchema = z
  .object({
    input: semanticInputSchema,
    ids: z.array(z.string().max(50)).min(1).max(3),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      new Set(body.ids).size !== body.ids.length ||
      body.ids.some((id) => !Object.hasOwn(questions[body.input.kind], id))
    )
      ctx.addIssue({
        code: "custom",
        message: "Only the demo's fixed questions are accepted",
      });
  });
export function questionsFor(
  kind: ScopeKind,
  ids: readonly string[] = Object.keys(questions[kind]),
): Record<string, RuntimeQuestion> {
  const allowed: Record<string, RuntimeQuestion> = questions[kind];
  return Object.fromEntries(
    [...ids].sort().map((id) => {
      const q = allowed[id];
      if (!q) throw new Error("Unknown judgment");
      return [id, q];
    }),
  );
}
const compactEvent = ({
  type,
  previous,
  next,
  districtId,
}: VillageState["recentEvents"][number]) => ({
  type,
  previous,
  next,
  districtId,
});
export function villageInput(w: VillageState): SemanticInput {
  const { foodSupply, treasury, taxRate, crime, trade, population } = w;
  return {
    kind: "village",
    scopeId: "village",
    facts: {
      foodSupply,
      treasury,
      taxRate,
      crime,
      trade,
      population,
      ...w.policies,
      events: w.recentEvents.map(compactEvent),
    },
    inherited: {},
  };
}
export function districtInput(
  w: VillageState,
  id: DistrictId,
  inherited: Record<string, JsonValue>,
): SemanticInput {
  const { id: _id, name: _name, ...facts } = w.districts[id];
  return { kind: "district", scopeId: `district:${id}`, facts, inherited };
}
export function familyInput(
  w: VillageState,
  id: string,
  inherited: Record<string, JsonValue>,
): SemanticInput {
  const { savings, foodDays, dependents, incomeDelta } = w.families[id]!;
  return {
    kind: "family",
    scopeId: `family:${id}`,
    facts: { savings, foodDays, dependents, incomeDelta },
    inherited,
  };
}
export function personInput(
  w: VillageState,
  id: string,
  inherited: Record<string, JsonValue>,
): SemanticInput {
  const {
    occupation,
    wealth,
    hunger,
    health,
    recentIncomeDelta,
    witnessedEventIds,
  } = w.people[id]!;
  return {
    kind: "person",
    scopeId: `person:${id}`,
    facts: {
      occupation,
      wealth,
      hunger,
      health,
      recentIncomeDelta,
      witnessedEvents: w.recentEvents
        .filter((e) => witnessedEventIds.includes(e.id))
        .map(compactEvent),
    },
    inherited,
  };
}
