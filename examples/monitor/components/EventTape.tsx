import { useEventSnapshot } from "../events/provider.js";
import { eventLabel } from "../events/model.js";
import { scenarios, type ScenarioId } from "../events/scenarios.js";
import { Icon } from "./Icon.js";

export function EventTape({ scenario }: { scenario: ScenarioId }) {
  const { facts, queued } = useEventSnapshot();
  const events = scenarios[scenario].events;
  const latest = facts.events.at(-1);
  const committed = new Set(facts.events.map((e) => e.id));
  return (
    <section className="event-tape" aria-label="Replay event track">
      <div className="tape-label">
        <Icon name="clock" size={15} />
        <span>
          EVENT TRACK<small>REPLAY / UTC</small>
        </span>
      </div>
      <div className="tape-track">
        {events.map((event, i) => (
          <div
            key={event.id}
            className={`tape-step ${committed.has(event.id) ? "committed" : ""} ${latest?.id === event.id ? "current" : ""}`}
            title={eventLabel(event)}
          >
            <span className="tape-tick">
              <i />
            </span>
            <time>{event.timestamp.slice(11, 16)}</time>
            <small>{String(i + 1).padStart(2, "0")}</small>
          </div>
        ))}
      </div>
      <div className="latest-signal" key={latest?.id ?? "baseline"}>
        <span>
          <i />
          {queued.length
            ? "COALESCING OBSERVATIONS"
            : latest
              ? "LATEST OBSERVATION"
              : "AWAITING FIRST EVENT"}
        </span>
        <b>{latest ? eventLabel(latest) : "Baseline loaded. Replay ready."}</b>
      </div>
    </section>
  );
}
