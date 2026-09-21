import { z } from "zod";
import { freezeJson } from "../../../src/react/json.js";
export const places = {
  jp: {
    name: "Japan",
    scope: "country:jp",
    region: "region:asia",
    lat: 36,
    lon: 138,
  },
  kr: {
    name: "South Korea",
    scope: "country:kr",
    region: "region:asia",
    lat: 36,
    lon: 127.5,
  },
  cn: {
    name: "China",
    scope: "country:cn",
    region: "region:asia",
    lat: 35,
    lon: 104,
  },
  us: {
    name: "United States",
    scope: "country:us",
    region: "global",
    lat: 39,
    lon: -99,
  },
  eu: {
    name: "Europe",
    scope: "region:europe",
    region: "global",
    lat: 50,
    lon: 12,
  },
  me: {
    name: "Middle East",
    scope: "region:middle-east",
    region: "global",
    lat: 27,
    lon: 47,
  },
} as const;
export type PlaceId = keyof typeof places;
export const placeIds = Object.keys(places) as PlaceId[];
export type Domain = "weather" | "transport" | "markets" | "news";
const n = (max: number) => z.number().min(0).max(max);
export const weatherSchema = z
  .object({ warning: n(5), windKph: n(350), rainMm: n(1500) })
  .strict();
export const transportSchema = z
  .object({
    cancelled: n(10000),
    delayed: n(10000),
    railWarnings: n(100),
    shippingDelayHours: n(1000),
    fuelSurchargePct: n(100),
  })
  .strict();
export const marketsSchema = z
  .object({
    changePct: z.number().min(-100).max(100),
    volatility: n(200),
    oilChangePct: z.number().min(-100).max(200),
  })
  .strict();
export const newsSchema = z
  .object({
    supplyOfflinePct: n(100),
    infrastructureOutages: n(10000),
    notice: z.enum([
      "none",
      "monitoring",
      "support_announced",
      "restrictions",
      "restored",
    ]),
  })
  .strict();
const common = {
  id: z.string().regex(/^[a-z0-9:-]{1,80}$/),
  timestamp: z.iso.datetime(),
  source: z
    .object({
      id: z.enum([
        "replay-weather",
        "replay-aviation",
        "replay-rail",
        "replay-market",
        "replay-wire",
        "replay-shipping",
      ]),
      label: z.string().max(60),
    })
    .strict(),
  scopes: z
    .array(
      z.enum([
        "country:jp",
        "country:kr",
        "country:cn",
        "country:us",
        "region:europe",
        "region:middle-east",
        "region:asia",
        "global",
        "domain:aviation",
        "domain:energy",
      ]),
    )
    .min(1)
    .max(6),
  place: z.enum(["jp", "kr", "cn", "us", "eu", "me"]),
};
export const eventSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        ...common,
        type: z.literal("weather_warning"),
        payload: weatherSchema.partial(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("transport_disruption"),
        payload: transportSchema.partial(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("market_move"),
        payload: marketsSchema.partial(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("major_news"),
        payload: newsSchema.partial(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("government_notice"),
        payload: newsSchema.partial(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("infrastructure_incident"),
        payload: newsSchema.partial(),
      })
      .strict(),
  ])
  .superRefine((event, ctx) => {
    if (!event.scopes.includes(places[event.place].scope))
      ctx.addIssue({
        code: "custom",
        message: "Event must include its measured geographic scope",
      });
    if (!Object.keys(event.payload).length)
      ctx.addIssue({
        code: "custom",
        message: "An observation must update at least one fact",
      });
  });
export type WorldEvent = z.infer<typeof eventSchema>;
export type Evidence = { eventId: string; sourceId: string; timestamp: string };
export type Observation = Record<string, string | number>;
export interface FactSlice {
  current: Observation;
  history: { timestamp: string; values: Observation }[];
  provenance: Record<string, Evidence>;
  eventIds: string[];
}
export interface CountryFacts {
  weather: FactSlice;
  transport: FactSlice;
  markets: FactSlice;
  news: FactSlice;
}
export interface WorldFacts {
  countries: Record<PlaceId, CountryFacts>;
  events: WorldEvent[];
  revision: number;
  clock: string;
}
export const epoch = "2026-09-20T09:00:00.000Z";
function slice(current: Observation): FactSlice {
  return {
    current,
    history: [],
    eventIds: [],
    provenance: Object.fromEntries(
      Object.keys(current).map((key) => [
        key,
        { eventId: "seed", sourceId: "scenario-baseline", timestamp: epoch },
      ]),
    ),
  };
}
export function initialFacts(): WorldFacts {
  return {
    countries: Object.fromEntries(
      placeIds.map((id) => [
        id,
        {
          weather: slice({ warning: 0, windKph: 12, rainMm: 0 }),
          transport: slice({
            cancelled: 0,
            delayed: 0,
            railWarnings: 0,
            shippingDelayHours: 0,
            fuelSurchargePct: 0,
          }),
          markets: slice({ changePct: 0, volatility: 12, oilChangePct: 0 }),
          news: slice({
            supplyOfflinePct: 0,
            infrastructureOutages: 0,
            notice: "none",
          }),
        },
      ]),
    ) as Record<PlaceId, CountryFacts>,
    events: [],
    revision: 0,
    clock: epoch,
  };
}
export function eventDomain(event: WorldEvent): Domain {
  return event.type === "weather_warning"
    ? "weather"
    : event.type === "transport_disruption"
      ? "transport"
      : event.type === "market_move"
        ? "markets"
        : "news";
}
/** Absolute observations, not semantic conclusions. Per-field source time wins. */
export function reduceWorldEvent(
  world: WorldFacts,
  raw: WorldEvent,
): WorldFacts {
  const event = freezeJson(eventSchema.parse(raw));
  if (world.events.some((e) => e.id === event.id)) return world;
  const domain = eventDomain(event),
    country = world.countries[event.place],
    prior = country[domain];
  const current = { ...prior.current },
    provenance = { ...prior.provenance };
  let touched = false;
  for (const [key, value] of Object.entries(event.payload)) {
    const prev = provenance[key]!;
    // Tie-break by event ID so a replay in source order is unambiguous.
    if (
      event.timestamp < prev.timestamp ||
      (event.timestamp === prev.timestamp && event.id <= prev.eventId)
    )
      continue;
    current[key] = value;
    provenance[key] = {
      eventId: event.id,
      sourceId: event.source.id,
      timestamp: event.timestamp,
    };
    touched = true;
  }
  const updated = touched
    ? {
        current,
        provenance,
        eventIds: [...prior.eventIds, event.id].slice(-8),
        history: [
          ...prior.history,
          {
            timestamp: Object.values(prior.provenance)
              .map((p) => p.timestamp)
              .sort()
              .at(-1)!,
            values: prior.current,
          },
        ].slice(-3),
      }
    : prior;
  return {
    countries: touched
      ? { ...world.countries, [event.place]: { ...country, [domain]: updated } }
      : world.countries,
    events: [...world.events, event],
    revision: world.revision + 1,
    clock: event.timestamp > world.clock ? event.timestamp : world.clock,
  };
}
export function eventLabel(event: WorldEvent): string {
  const p = event.payload as Observation;
  if (event.type === "weather_warning")
    return `${places[event.place].name} weather bulletin · warning ${p.warning ?? "unchanged"}${p.windKph !== undefined ? ` · wind ${p.windKph} km/h` : ""}`;
  if (event.type === "transport_disruption")
    return p.cancelled !== undefined
      ? `${places[event.place].name} aviation · ${p.cancelled} cancelled, ${p.delayed ?? 0} delayed`
      : p.railWarnings !== undefined
        ? `Rail operator · ${p.railWarnings} service warnings`
        : p.shippingDelayHours !== undefined
          ? `Shipping delay · ${p.shippingDelayHours} hours`
          : `Aviation fuel surcharge · ${p.fuelSurchargePct}%`;
  if (event.type === "market_move")
    return p.oilChangePct !== undefined
      ? `Oil benchmark move · ${p.oilChangePct}%`
      : `${places[event.place].name} market · ${p.changePct ?? "unchanged"}% · volatility ${p.volatility ?? "unchanged"}`;
  if (p.supplyOfflinePct !== undefined)
    return `Supply facility incident · ${p.supplyOfflinePct}% capacity offline`;
  return `${places[event.place].name} notice · ${String(p.notice ?? "infrastructure report").replaceAll("_", " ")}`;
}
