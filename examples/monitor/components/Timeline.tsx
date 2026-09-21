import { useState } from "react";
import { useEventSnapshot } from "../events/provider.js";
import { eventLabel } from "../events/model.js";
import { useTransitions } from "../semantic/provider.js";
import { format } from "./status.js";
export function Timeline({ onInspect }: { onInspect: (id: string) => void }) {
  const { facts } = useEventSnapshot(),
    changes = useTransitions(),
    [filter, setFilter] = useState("all");
  const entries = [
    ...facts.events.map((event, index) => ({
      id: event.id,
      time: event.timestamp,
      order: index,
      kind: "event",
      title: eventLabel(event),
      detail: `${event.source.label} · ${event.id}`,
      node: "",
    })),
    ...changes
      .filter((c) => c.from !== null)
      .map((c, index) => ({
        id: c.id,
        time: c.timestamp,
        order: 1000 + changes.length - index,
        kind: "meaning",
        title: `${c.semanticId}: ${format(c.from)} → ${format(c.to)}`,
        detail: `${c.source === "mock" ? "SIMULATED" : "JEV INTERPRETATION"} · ${c.triggeringChanges.join(" + ")}`,
        node: c.semanticId,
      })),
  ]
    .filter((e) => filter === "all" || filter === e.kind)
    .sort((a, b) => b.time.localeCompare(a.time) || b.order - a.order)
    .slice(0, 32);
  return (
    <section className="timeline" aria-label="Event and semantic timeline">
      <div className="panel-heading">
        <h2>Signal → meaning ledger</h2>
        <div className="ledger-filter">
          {["all", "event", "meaning"].map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All"
                : f === "event"
                  ? "Events"
                  : "Semantic changes"}
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-entries">
        {entries.length ? (
          entries.map((entry) => (
            <article key={entry.id} className={`ledger-entry ${entry.kind}`}>
              <time>
                {entry.time.slice(11, 19)}
                <small>REPLAY UTC</small>
              </time>
              <span className="entry-type">
                {entry.kind === "event" ? "EVENT / FACT" : "SEMANTIC CHANGE"}
              </span>
              <div>
                {entry.node ? (
                  <button onClick={() => onInspect(entry.node)}>
                    {entry.title}
                  </button>
                ) : (
                  <strong>{entry.title}</strong>
                )}
                <small>{entry.detail}</small>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-ledger">
            <span>00:00 / BASELINE</span>
            <h3>The world is quiet. The graph is listening.</h3>
            <p>
              Play a scenario or advance one event. Meaning updates
              automatically; inspection never triggers inference.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
