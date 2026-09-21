import { useEffect, useState } from "react";
import { DemoRateLimitError } from "./live-client.js";

export function useRetrySeconds(error: Error | undefined) {
  const retryAt = error instanceof DemoRateLimitError ? error.retryAt : 0;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= retryAt) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [retryAt]);
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

export function DemoErrorNotice({
  error,
  seconds,
  onRetry,
}: {
  error: Error;
  seconds: number;
  onRetry: () => void;
}) {
  const limited = error instanceof DemoRateLimitError;
  const explanation = !limited
    ? error.message
    : error.scope === "ip-day"
      ? "This IP has reached its daily request allowance."
      : error.scope === "demo-day"
        ? "The demo has used today's shared inference allowance."
        : error.scope === "ip-minute"
          ? "This IP has reached its per-minute request limit."
          : "Too many demo requests. Please let the cooldown finish.";
  const wait =
    seconds >= 3600
      ? `${Math.ceil(seconds / 60)} min`
      : seconds >= 60
        ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        : `${seconds}s`;
  return (
    <div className="error-notice" role="alert">
      <strong>
        {limited
          ? seconds > 0
            ? `Rate limited · retry in ${wait}`
            : "Ready to try again"
          : "Couldn’t update this scene"}
      </strong>
      <p>{explanation}</p>
      <button
        className="text-button"
        disabled={limited && seconds > 0}
        onClick={onRetry}
      >
        {limited && seconds > 0 ? `Try again in ${wait}` : "Try again"}
      </button>
    </div>
  );
}
