import type { JudgmentRequest } from "../../../src/adapters/adapter.js";
import type { RuntimeAnswer } from "../../../src/types.js";
import type { SemanticInput } from "./contract.js";
/** Authored fixtures/rules only. This is a simulation of semantic outputs, not inference. */
export function mockSemantics(
  request: JudgmentRequest,
): Record<string, RuntimeAnswer> {
  const {
    kind,
    facts: f,
    inherited: p,
  } = request.state as unknown as SemanticInput;
  const selected: Record<string, string | number> = {};
  if (kind === "village") {
    const food = Number(f.foodSupply),
      tax = Number(f.taxRate),
      crime = Number(f.crime);
    selected["village.mood"] =
      food < 25
        ? "desperate"
        : tax >= 0.36
          ? "angry"
          : food < 45 || tax >= 0.24 || crime > 0.2
            ? "anxious"
            : tax < 0.12
              ? "hopeful"
              : "stable";
    selected["village.concern"] =
      food < 40
        ? "food"
        : crime > 0.25
          ? "safety"
          : tax >= 0.24
            ? "money"
            : Number(f.population) > 18
              ? "outsiders"
              : "none";
    selected["village.trust"] =
      food < 25 ? 0.25 : tax >= 0.24 || crime > 0.2 ? 0.85 : 1.7;
  } else if (kind === "district") {
    selected["district.mood"] =
      Number(f.prices) >= 1.15 && p["village.concern"] === "money"
        ? "angry"
        : Number(f.foodStock) < 25 ||
            Number(f.incidentCount) > 0 ||
            p["village.mood"] === "desperate"
          ? "uneasy"
          : p["village.mood"] === "hopeful" || Number(f.foodStock) >= 85
            ? "optimistic"
            : "calm";
    selected["district.pressure"] =
      Number(f.foodStock) < 25
        ? "food"
        : Number(f.incidentCount) > 0
          ? "crime"
          : Number(f.prices) >= 1.15
            ? "prices"
            : Number(f.tradeVolume) < 50 || Number(f.openStalls) === 0
              ? "trade"
              : "none";
  } else if (kind === "family") {
    selected["family.stability"] =
      Number(f.foodDays) < 2 || Number(f.savings) < 25
        ? "precarious"
        : Number(f.incomeDelta) < 0 || p["district.mood"] === "angry"
          ? "strained"
          : "stable";
    selected["family.grievance"] =
      Number(f.foodDays) < 2
        ? "food"
        : Number(f.incomeDelta) < 0
          ? "money"
          : p["district.pressure"] === "crime"
            ? "safety"
            : "none";
  } else {
    selected["person.attitude"] =
      Number(f.recentIncomeDelta) < -15 ||
      (f.occupation === "merchant" &&
        p["district.mood"] === "angry" &&
        Number(f.recentIncomeDelta) < 0) ||
      (p["family.stability"] === "precarious" && Number(f.hunger) > 35)
        ? "hostile"
        : p["family.stability"] !== "stable" || Number(f.recentIncomeDelta) < 0
          ? "skeptical"
          : Number(f.recentIncomeDelta) > 0 || f.occupation === "healer"
            ? "supportive"
            : "neutral";
    selected["person.secure"] =
      p["family.stability"] === "precarious"
        ? 0.12
        : p["district.pressure"] === "crime"
          ? 0.35
          : Number(f.health) < 30
            ? 0.18
            : 0.84;
  }
  return Object.fromEntries(
    Object.entries(request.questions).map(([id, q]) => {
      if (q.type === "choice") {
        const keys = Object.keys(q.criteria),
          choice = String(selected[id] ?? keys[0]);
        return [
          id,
          {
            type: "choice",
            choice,
            confidence: 0.82,
            probabilities: Object.fromEntries(
              keys.map((key) => [
                key,
                key === choice ? 0.8 : 0.2 / (keys.length - 1),
              ]),
            ),
          },
        ];
      }
      if (q.type === "noul")
        return [id, { type: "noul", noul: Number(selected[id] ?? 0.5) }];
      const score = Number(selected[id] ?? 1),
        low = Math.floor(score),
        high = Math.ceil(score);
      return [
        id,
        {
          type: "score",
          score,
          confidence: 0.8,
          legend: Object.fromEntries(
            q.criteria.map((label, i) => [String(i), label]),
          ),
          probabilities: Object.fromEntries(
            q.criteria.map((_, i) => [
              String(i),
              low === high
                ? Number(i === low)
                : i === low
                  ? high - score
                  : i === high
                    ? score - low
                    : 0,
            ]),
          ),
        },
      ];
    }),
  );
}
