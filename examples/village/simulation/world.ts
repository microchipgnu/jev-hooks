export const districtIds = [
  "square",
  "market",
  "farms",
  "docks",
  "oldtown",
] as const;
export type DistrictId = (typeof districtIds)[number];
export type Occupation =
  | "merchant"
  | "baker"
  | "farmer"
  | "dockworker"
  | "guard"
  | "healer"
  | "weaver"
  | "child"
  | "elder";
export type PersonState = {
  id: string;
  name: string;
  districtId: DistrictId;
  familyId: string;
  occupation: Occupation;
  wealth: number;
  hunger: number;
  health: number;
  recentIncomeDelta: number;
  witnessedEventIds: string[];
};
export type DistrictState = {
  id: DistrictId;
  name: string;
  prices: number;
  openStalls: number;
  totalStalls: number;
  tradeVolume: number;
  foodStock: number;
  workers: number;
  incidentCount: number;
};
export type FamilyState = {
  id: string;
  name: string;
  districtId: DistrictId;
  savings: number;
  foodDays: number;
  dependents: number;
  incomeDelta: number;
};
export type EventType =
  | "tax_changed"
  | "food_distributed"
  | "grain_rationed"
  | "guards_hired"
  | "theft"
  | "theft_ignored"
  | "crime_punished"
  | "refugees_arrived"
  | "farm_investment"
  | "market_changed"
  | "harvest_failed";
export type VillageEvent = {
  id: string;
  day: number;
  type: EventType;
  previous: number;
  next: number;
  districtId: DistrictId | "village";
};
export type VillageState = {
  day: number;
  foodSupply: number;
  treasury: number;
  taxRate: number;
  crime: number;
  trade: number;
  population: number;
  policies: { guards: number; rationing: boolean; marketOpen: boolean };
  recentEvents: VillageEvent[];
  districts: Record<DistrictId, DistrictState>;
  families: Record<string, FamilyState>;
  people: Record<string, PersonState>;
};
export const householdSeeds = [
  {
    id: "bell",
    name: "Bell",
    districtId: "square",
    people: [
      ["ada", "Ada", "healer"],
      ["fenn", "Fenn", "guard"],
      ["jori", "Jori", "elder"],
    ],
  },
  {
    id: "venn",
    name: "Venn",
    districtId: "market",
    people: [
      ["mara", "Mara", "merchant"],
      ["tovin", "Tovin", "baker"],
      ["seli", "Seli", "weaver"],
    ],
  },
  {
    id: "aster",
    name: "Aster",
    districtId: "farms",
    people: [
      ["edda", "Edda", "farmer"],
      ["ren", "Ren", "farmer"],
      ["tess", "Tess", "child"],
    ],
  },
  {
    id: "fen",
    name: "Fen",
    districtId: "docks",
    people: [
      ["ilan", "Ilan", "dockworker"],
      ["nera", "Nera", "merchant"],
      ["perrin", "Perrin", "dockworker"],
    ],
  },
  {
    id: "moss",
    name: "Moss",
    districtId: "oldtown",
    people: [
      ["orin", "Orin", "elder"],
      ["lysa", "Lysa", "weaver"],
      ["emri", "Emri", "child"],
    ],
  },
] as const;
export const districtNames: Record<DistrictId, string> = {
  square: "The Square",
  market: "Market",
  farms: "Farms",
  docks: "Docks",
  oldtown: "Old Town",
};
export function seedWorld(): VillageState {
  const families: Record<string, FamilyState> = {};
  const people: Record<string, PersonState> = {};
  for (const [index, family] of householdSeeds.entries()) {
    families[family.id] = {
      id: family.id,
      name: family.name,
      districtId: family.districtId,
      savings: 85 + index * 9,
      foodDays: 5,
      dependents: family.people.some((p) => p[2] === "child") ? 1 : 0,
      incomeDelta: 0,
    };
    for (const [i, [id, name, occupation]] of family.people.entries())
      people[id] = {
        id,
        name,
        occupation,
        districtId: family.districtId,
        familyId: family.id,
        wealth: 42 + index * 4 - i * 5,
        hunger: 12,
        health: 90,
        recentIncomeDelta: 0,
        witnessedEventIds: [],
      };
  }
  const districts = Object.fromEntries(
    districtIds.map((id) => [
      id,
      {
        id,
        name: districtNames[id],
        prices: 1.04,
        openStalls: id === "market" ? 7 : 3,
        totalStalls: id === "market" ? 7 : 3,
        tradeVolume: 80,
        foodStock: id === "farms" ? 85 : 60,
        workers: 3,
        incidentCount: 0,
      },
    ]),
  ) as Record<DistrictId, DistrictState>;
  return {
    day: 1,
    foodSupply: 68,
    treasury: 420,
    taxRate: 0.12,
    crime: 0.08,
    trade: 82,
    population: 15,
    policies: { guards: 2, rationing: false, marketOpen: true },
    recentEvents: [],
    districts,
    families,
    people,
  };
}
export type Action =
  | "raise-tax"
  | "lower-tax"
  | "food"
  | "ration"
  | "guards"
  | "ignore-theft"
  | "punish"
  | "refugees"
  | "farms"
  | "market"
  | "theft"
  | "shortage"
  | "reset";
export const actions: {
  id: Action;
  label: string;
  detail: string;
  cost?: number;
}[] = [
  {
    id: "raise-tax",
    label: "Raise taxes",
    detail: "+12 points · +90 treasury",
  },
  { id: "lower-tax", label: "Lower taxes", detail: "−6 points · −35 treasury" },
  {
    id: "food",
    label: "Distribute food",
    detail: "−55 treasury · +24 food",
    cost: 55,
  },
  { id: "ration", label: "Ration grain", detail: "+12 reserve · +8 hunger" },
  {
    id: "guards",
    label: "Hire guards",
    detail: "−65 treasury · −8% crime",
    cost: 65,
  },
  {
    id: "ignore-theft",
    label: "Ignore a theft",
    detail: "+12% crime · market loses 12 food",
  },
  { id: "punish", label: "Punish a thief", detail: "−10% crime · +1 incident" },
  {
    id: "refugees",
    label: "Welcome refugees",
    detail: "+3 residents · −14 food",
  },
  {
    id: "farms",
    label: "Invest in farms",
    detail: "−80 treasury · +20 food",
    cost: 80,
  },
  {
    id: "market",
    label: "Toggle market",
    detail: "Close or reopen the stalls",
  },
];
export const scenario: Action[] = [
  "raise-tax",
  "theft",
  "ignore-theft",
  "shortage",
  "food",
];
const clamp = (v: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Math.round(v * 100) / 100));
export function reduceWorld(
  previous: VillageState,
  action: Action,
): VillageState {
  if (action === "reset") return seedWorld();
  const cost = actions.find((a) => a.id === action)?.cost ?? 0;
  if (previous.treasury < cost) return previous;
  const s = structuredClone(previous);
  s.day++;
  let type: EventType = "tax_changed",
    before = 0,
    next = 0,
    districtId: DistrictId | "village" = "village";
  const money = (delta: number) => {
    for (const p of Object.values(s.people)) {
      p.wealth = clamp(p.wealth + delta, 0, 1000);
      p.recentIncomeDelta = delta;
    }
    for (const f of Object.values(s.families)) {
      f.savings = clamp(f.savings + delta * 3, 0, 10000);
      f.incomeDelta = delta * 3;
    }
  };
  if (action === "raise-tax" || action === "lower-tax") {
    before = s.taxRate;
    s.taxRate = clamp(
      s.taxRate + (action === "raise-tax" ? 0.12 : -0.06),
      0.02,
      0.6,
    );
    next = s.taxRate;
    s.treasury = clamp(
      s.treasury + (action === "raise-tax" ? 90 : -35),
      0,
      10000,
    );
    money(action === "raise-tax" ? -12 : 6);
    s.districts.market.prices = clamp(
      s.districts.market.prices + (action === "raise-tax" ? 0.12 : -0.06),
      0.7,
      3,
    );
  } else if (action === "food" || action === "farms") {
    type = action === "food" ? "food_distributed" : "farm_investment";
    before = s.foodSupply;
    s.foodSupply = clamp(s.foodSupply + (action === "food" ? 24 : 20));
    next = s.foodSupply;
    s.treasury -= cost;
    for (const f of Object.values(s.families))
      f.foodDays = clamp(f.foodDays + 2, 0, 20);
    for (const p of Object.values(s.people)) p.hunger = clamp(p.hunger - 20);
    s.districts.farms.foodStock = clamp(s.districts.farms.foodStock + 25);
    s.districts.market.foodStock = clamp(s.districts.market.foodStock + 15);
  } else if (action === "ration") {
    type = "grain_rationed";
    before = s.foodSupply;
    s.foodSupply = clamp(s.foodSupply + 12);
    next = s.foodSupply;
    s.policies.rationing = true;
    for (const p of Object.values(s.people)) p.hunger = clamp(p.hunger + 8);
  } else if (action === "guards" || action === "punish") {
    type = action === "guards" ? "guards_hired" : "crime_punished";
    before = s.crime;
    s.crime = clamp(s.crime - (action === "guards" ? 0.08 : 0.1), 0, 1);
    next = s.crime;
    if (action === "guards") {
      s.treasury -= cost;
      s.policies.guards += 2;
    } else s.districts.square.incidentCount++;
  } else if (action === "ignore-theft" || action === "theft") {
    type = action === "theft" ? "theft" : "theft_ignored";
    before = s.crime;
    s.crime = clamp(s.crime + 0.12, 0, 1);
    next = s.crime;
    districtId = "market";
    s.districts.market.incidentCount++;
    s.districts.market.foodStock = clamp(s.districts.market.foodStock - 12);
    s.people.mara!.wealth = clamp(s.people.mara!.wealth - 14);
    s.people.mara!.recentIncomeDelta -= 14;
    s.families.venn!.savings = clamp(s.families.venn!.savings - 25, 0, 10000);
    s.families.venn!.incomeDelta -= 25;
  } else if (action === "refugees") {
    type = "refugees_arrived";
    before = s.population;
    s.population = clamp(s.population + 3, 0, 90);
    next = s.population;
    s.foodSupply = clamp(s.foodSupply - 14);
    s.districts.docks.workers++;
  } else if (action === "market") {
    type = "market_changed";
    before = Number(s.policies.marketOpen);
    s.policies.marketOpen = !s.policies.marketOpen;
    next = Number(s.policies.marketOpen);
    s.districts.market.openStalls = s.policies.marketOpen ? 7 : 0;
    s.trade = s.policies.marketOpen ? 82 : 35;
    s.districts.docks.tradeVolume = s.trade;
    districtId = "market";
  } else if (action === "shortage") {
    type = "harvest_failed";
    before = s.foodSupply;
    s.foodSupply = clamp(s.foodSupply - 48);
    next = s.foodSupply;
    districtId = "farms";
    for (const f of Object.values(s.families))
      f.foodDays = clamp(f.foodDays - 4, 0, 20);
    for (const p of Object.values(s.people)) p.hunger = clamp(p.hunger + 38);
    s.districts.farms.foodStock = 15;
    s.districts.market.prices = clamp(s.districts.market.prices + 0.3, 0.7, 3);
  }
  const event: VillageEvent = {
    id: `event-${s.day}`,
    day: s.day,
    type,
    previous: before,
    next,
    districtId,
  };
  s.recentEvents = [...s.recentEvents, event].slice(-8);
  for (const p of Object.values(s.people))
    if (districtId === "village" || p.districtId === districtId)
      p.witnessedEventIds = [...p.witnessedEventIds, event.id].slice(-5);
  return s;
}
export function eventLabel(e: VillageEvent) {
  const labels: Record<EventType, string> = {
    tax_changed: "Tax rate",
    food_distributed: "Food distributed · supply",
    grain_rationed: "Grain rationed · reserve",
    guards_hired: "Guards hired · crime",
    theft: "Theft at Market · crime",
    theft_ignored: "Theft ignored · crime",
    crime_punished: "Thief punished · crime",
    refugees_arrived: "Refugees welcomed · population",
    farm_investment: "Farms invested in · food",
    market_changed: "Market open",
    harvest_failed: "Harvest failed · food",
  };
  const format = (n: number) =>
    [
      "tax_changed",
      "theft",
      "theft_ignored",
      "crime_punished",
      "guards_hired",
    ].includes(e.type)
      ? `${Math.round(n * 100)}%`
      : String(n);
  return `${labels[e.type]}: ${format(e.previous)} → ${format(e.next)}`;
}
export function scopePath(scopeId: string, world: VillageState): string[] {
  if (scopeId === "village") return ["village"];
  const [kind, id = ""] = scopeId.split(":");
  if (kind === "district" && world.districts[id as DistrictId])
    return ["village", scopeId];
  const family =
    kind === "family"
      ? world.families[id]
      : world.families[world.people[id]?.familyId ?? ""];
  if (!family) return ["village"];
  return [
    "village",
    `district:${family.districtId}`,
    `family:${family.id}`,
    ...(kind === "person" ? [scopeId] : []),
  ];
}
export function scopeName(id: string, world: VillageState) {
  const [kind, key = ""] = id.split(":");
  return kind === "district"
    ? world.districts[key as DistrictId]?.name
    : kind === "family"
      ? `${world.families[key]?.name} family`
      : kind === "person"
        ? world.people[key]?.name
        : "Village";
}
