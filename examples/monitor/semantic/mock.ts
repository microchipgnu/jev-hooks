import type { JudgmentRequest } from "../../../src/adapters/adapter.js";
import type { RuntimeAnswer } from "../../../src/types.js";
import type { FactSlice } from "../events/model.js";
import type { MonitorInput } from "./contract.js";
const clamp = (n: number) => Math.max(0, Math.min(3, n));
const number = (o: Record<string, unknown>, key: string) => Number(o[key] ?? 0);
const weatherLevel = (c: Record<string, unknown>) =>
  clamp(number(c, "warning") * 0.6);
const transportLevel = (c: Record<string, unknown>) =>
  clamp(
    Math.max(
      number(c, "cancelled") / 25,
      number(c, "railWarnings") * 0.75,
      number(c, "shippingDelayHours") / 18,
    ),
  );
const marketLevel = (c: Record<string, unknown>) =>
  clamp(
    Math.max(
      Math.abs(number(c, "changePct")) / 2,
      (number(c, "volatility") - 15) / 12,
    ),
  );
const energyLevel = (c: Record<string, unknown>) =>
  clamp(number(c, "supplyOfflinePct") / 14);
function trend(
  slice: FactSlice,
  measure: (c: Record<string, unknown>) => number,
): string {
  const previous = slice.history.at(-1);
  if (!previous) return "stable";
  const delta = measure(slice.current) - measure(previous.values);
  return delta > 0.08
    ? "deteriorating"
    : delta < -0.08
      ? "improving"
      : "stable";
}
/** Authored scenario interpretations only. Never represented as model output. */
export function mockMonitor(
  request: JudgmentRequest,
): Record<string, RuntimeAnswer> {
  const input = request.state as unknown as MonitorInput,
    f = input.facts as unknown as Record<string, FactSlice>,
    inherited = input.inherited;
  const n = (id: string) => Number(inherited[id] ?? 0);
  let values: Record<string, string | number> = {};
  if (input.kind === "weather") {
    const severity = weatherLevel(f.slice!.current);
    values = {
      severity,
      urgency: severity >= 2 ? 0.89 : severity > 0.7 ? 0.57 : 0.06,
      trend: trend(f.slice!, weatherLevel),
    };
  } else if (input.kind === "transport") {
    const disruption = clamp(
      Math.max(
        transportLevel(f.slice!.current),
        n("jp.weather.severity") * 0.65,
        n("aviation.cost.pressure") * 0.25,
      ),
    );
    const localTrend = trend(f.slice!, transportLevel);
    values = {
      disruption,
      trend:
        inherited["jp.weather.trend"] === "improving"
          ? "improving"
          : localTrend !== "stable"
            ? localTrend
            : (inherited["jp.weather.trend"] ?? "stable"),
    };
  } else if (input.kind === "market")
    values = { stress: marketLevel(f.slice!.current) };
  else if (input.kind === "market-spillover")
    values = {
      stress: marketLevel(f.slice!.current),
      trend: trend(f.slice!, marketLevel),
    };
  else if (input.kind === "market-attention")
    values = {
      urgent: Math.min(
        0.99,
        0.05 + n("global.markets.stress") * Number(input.facts.exposure) * 0.45,
      ),
    };
  else if (input.kind === "market-exposure")
    values = {
      pressure: clamp(
        n("global.markets.stress") * Number(input.facts.exposure),
      ),
      trend: inherited["global.markets.trend"]!,
    };
  else if (input.kind === "news")
    values = {
      signals:
        Number(f.slice!.current.infrastructureOutages) > 0
          ? "infrastructure"
          : f.slice!.current.notice === "restrictions"
            ? "security"
            : ["support_announced", "restored"].includes(
                  String(f.slice!.current.notice),
                )
              ? "support"
              : "none",
    };
  else if (input.kind === "energy")
    values = {
      supplyRisk: clamp(
        Math.max(
          energyLevel(f.news!.current),
          Math.abs(Number(f.markets!.current.oilChangePct)) / 5,
          Number(f.transport!.current.shippingDelayHours) / 16,
        ),
      ),
      trend: trend(f.news!, energyLevel),
    };
  else if (input.kind === "pressure")
    values = {
      pressure: clamp(
        n("energy.supplyRisk") * (input.scopeId === "jp.imports" ? 1 : 0.85) +
          (input.scopeId === "aviation.cost"
            ? Number(f.slice!.current.fuelSurchargePct) / 50
            : 0),
      ),
    };
  else if (input.kind === "country") {
    const composed = input.scopeId === "country:jp";
    const weather = composed
      ? n("jp.weather.severity")
      : weatherLevel(f.weather!.current);
    const transport = composed
      ? n("jp.transport.disruption")
      : transportLevel(f.transport!.current);
    const economic = composed
      ? Math.max(
          n("jp.markets.stress"),
          n("jp.imports.pressure"),
          n("jp.spillover.pressure"),
        )
      : Math.max(
          marketLevel(f.markets!.current),
          energyLevel(f.news!.current),
          n("eu.energy.pressure"),
          n("eu.spillover.pressure"),
        );
    const infrastructure = composed
      ? inherited["jp.news.signals"] === "infrastructure"
        ? 2
        : 0
      : Math.min(3, Number(f.news!.current.infrastructureOutages));
    const severity = clamp(
      Math.max(weather, transport, economic, infrastructure),
    );
    const situation =
      severity < 0.6
        ? "normal"
        : weather >= 1.2 && economic >= 1.5
          ? "mixed"
          : weather >= transport && weather >= economic
            ? "weather"
            : economic >= transport && economic >= infrastructure
              ? "economic"
              : infrastructure > transport
                ? "infrastructure"
                : "transport";
    let direction = composed
      ? inherited["jp.weather.trend"]
      : trend(f.markets!, marketLevel);
    if (composed && direction === "stable")
      direction = inherited["jp.transport.trend"];
    if (!composed && direction === "stable")
      direction = trend(f.weather!, weatherLevel);
    if (!composed && f.news!.current.notice === "support_announced")
      direction = "improving";
    if (economic > Math.max(weather, transport) || direction === "stable")
      direction =
        inherited[composed ? "jp.spillover.trend" : "eu.spillover.trend"] ??
        direction;
    values = {
      situation,
      severity,
      urgency: severity > 2 ? 0.88 : severity > 0.6 ? 0.58 : 0.07,
      trend: direction ?? "stable",
    };
  } else {
    const scores = Object.entries(inherited)
      .filter(([id]) => id.endsWith(".severity"))
      .map(([, v]) => Number(v));
    const asian = inherited["region:asia.attention"];
    const high = scores.some((v) => v > 2.7) || asian === "high",
      elevated = scores.some((v) => v > 0.6) || asian === "elevated";
    const situations = Object.entries(inherited)
      .filter(([id]) => id.endsWith(".situation"))
      .map(([, v]) => String(v))
      .filter((v) => v !== "normal");
    if (
      inherited["region:asia.theme"] &&
      inherited["region:asia.theme"] !== "normal"
    )
      situations.push(String(inherited["region:asia.theme"]));
    const themes = [
      ...new Set(
        situations.map((v) =>
          v === "economic"
            ? "markets"
            : v === "infrastructure"
              ? "security"
              : v,
        ),
      ),
    ];
    values = {
      attention: high ? "high" : elevated ? "elevated" : "normal",
      theme: themes.length > 1 ? "mixed" : (themes[0] ?? "normal"),
    };
  }
  return Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      const value = values[id.slice(input.scopeId.length + 1)];
      if (question.type === "noul")
        return [id, { type: "noul", noul: Number(value) }];
      if (question.type === "choice") {
        const keys = Object.keys(question.criteria),
          selected = String(value);
        return [
          id,
          {
            type: "choice",
            choice: selected,
            confidence: 0.82,
            probabilities: Object.fromEntries(
              keys.map((key) => [
                key,
                key === selected ? 0.85 : 0.15 / (keys.length - 1),
              ]),
            ),
          },
        ];
      }
      const score = Math.round(clamp(Number(value)) * 100) / 100,
        low = Math.floor(score),
        high = Math.ceil(score);
      return [
        id,
        {
          type: "score",
          score,
          probabilities: Object.fromEntries(
            question.criteria.map((_, i) => [
              String(i),
              i === low ? 1 - (score - low) : i === high ? score - low : 0,
            ]),
          ),
          legend: Object.fromEntries(
            question.criteria.map((label, i) => [i, label]),
          ),
          confidence: 0.8,
        },
      ];
    }),
  ) as Record<string, RuntimeAnswer>;
}
