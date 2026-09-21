import type { Occupation } from "../simulation/world.js";
/** All movements and visual states are ordinary deterministic code. */
export function behaviorFor(
  occupation: Occupation,
  concern?: string | number,
  districtMood?: string | number,
  pressure?: string | number,
  attitude?: string | number,
) {
  if (attitude === "hostile")
    return {
      label:
        occupation === "merchant" || occupation === "baker"
          ? "closing shop early"
          : "keeping a distance",
      motion: "still",
    };
  if (occupation === "merchant" || occupation === "baker") {
    if (districtMood === "angry")
      return { label: "closing shop early", motion: "still" };
    if (concern === "food")
      return { label: "checking food supplies", motion: "working" };
  }
  if (occupation === "farmer" && concern === "food")
    return { label: "working by the granary", motion: "working" };
  if (occupation === "dockworker" && pressure === "trade")
    return { label: "waiting for a shipment", motion: "still" };
  if (attitude === "skeptical")
    return { label: "watching the square", motion: "slow" };
  return {
    label:
      occupation === "child"
        ? "playing by the path"
        : occupation === "guard"
          ? "walking the square"
          : "going about the day",
    motion: "wandering",
  };
}
