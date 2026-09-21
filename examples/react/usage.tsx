import {
  inputUsdPerMillion,
  pricingSource,
  type DemoUsage,
} from "../shared/usage.js";

export function Usage({
  usage,
  unavailable,
  callNote = "three judgments per call",
}: {
  usage: DemoUsage | null;
  unavailable: boolean;
  callNote?: string;
}) {
  const number = (value?: number) =>
    value === undefined ? "—" : value.toLocaleString();
  const cost =
    usage && (usage.meteredCalls > 0 || usage.inferenceCalls === 0)
      ? `$${usage.estimatedCostUsd.toFixed(8)}`
      : "—";
  const unmetered = usage ? usage.inferenceCalls - usage.meteredCalls : 0;
  return (
    <section className="usage-panel" aria-label="Shared demo usage">
      <div className="usage-heading">
        <h3>A little experiment. An open tab.</h3>
        <span>
          {usage
            ? `All visitors · tracked since ${new Date(usage.since).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
            : unavailable
              ? "Shared totals unavailable"
              : "All visitors · loading totals…"}
        </span>
      </div>
      <div className="usage-grid">
        <div>
          <span>TOTAL REQUESTS</span>
          <strong>{number(usage?.requests)}</strong>
          <small>valid API requests</small>
        </div>
        <div>
          <span>MODEL CALLS</span>
          <strong>{number(usage?.inferenceCalls)}</strong>
          <small>{callNote}</small>
        </div>
        <div>
          <span>CACHE REUSE</span>
          <strong>
            {number(
              usage ? usage.cacheHits + usage.coalescedRequests : undefined,
            )}
          </strong>
          <small>requests without new inference</small>
        </div>
        <div>
          <span>EST. MODEL COST</span>
          <strong className="usage-cost">{cost}</strong>
          <small>USD · {number(usage?.inputTokens)} input tokens</small>
        </div>
      </div>
      <p className="usage-note">
        Estimate: measured input tokens ×{" "}
        <a href={pricingSource} target="_blank" rel="noreferrer">
          ${inputUsdPerMillion} per million
        </a>
        . Output tokens are free at this published rate. Hosting and calls
        without token usage are excluded; this is not a Cloudflare bill.
        {unmetered > 0 &&
          ` ${number(unmetered)} model call${unmetered === 1 ? " has" : "s have"} pending or unavailable token usage.`}{" "}
        Browser cache hits never reach the server and aren’t counted. Earlier
        activity is not included.
      </p>
      {unavailable && (
        <p className="usage-note" role="status">
          Usage refresh unavailable.{" "}
          {usage
            ? "Showing the last received totals."
            : "Please try again shortly."}
        </p>
      )}
    </section>
  );
}
