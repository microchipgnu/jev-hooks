import {
  initialFacts,
  reduceWorldEvent,
  eventSchema,
  type WorldEvent,
  type WorldFacts,
} from "./model.js";
export interface EventSource {
  id: string;
  start(emit: (event: WorldEvent) => void): () => void;
}
/** Deterministic, pausable static replay. No model calls or semantic scheduling here. */
export class StaticReplayEventSource implements EventSource {
  readonly id = "static-replay";
  constructor(
    private events: readonly WorldEvent[],
    private delayMs = 6000,
  ) {}
  start(emit: (event: WorldEvent) => void) {
    let index = 0;
    const timer = setInterval(() => {
      const event = this.events[index++];
      if (event) emit(event);
      if (index >= this.events.length) clearInterval(timer);
    }, this.delayMs);
    return () => clearInterval(timer);
  }
}
export class MockEventSource extends StaticReplayEventSource {
  override readonly id = "static-replay";
}
export interface EventSnapshot {
  facts: WorldFacts;
  queued: readonly WorldEvent[];
  flushes: number;
  lastBurst: number;
}
export class EventRuntime {
  private snapshot: EventSnapshot = {
    facts: initialFacts(),
    queued: [],
    flushes: 0,
    lastBurst: 0,
  };
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(update: Partial<EventSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((fn) => fn());
  }
  ingest = (raw: WorldEvent) => {
    const event = eventSchema.parse(raw);
    if (
      this.snapshot.facts.events.some((e) => e.id === event.id) ||
      this.snapshot.queued.some((e) => e.id === event.id)
    )
      return;
    this.emit({ queued: [...this.snapshot.queued, event] });
    // Fixed window from first arrival; sustained streams cannot postpone a flush indefinitely.
    this.timer ??= setTimeout(this.flush, 250);
  };
  flush = () => {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.snapshot.queued.length) return;
    this.emit({
      facts: this.snapshot.queued.reduce(reduceWorldEvent, this.snapshot.facts),
      lastBurst: this.snapshot.queued.length,
      queued: [],
      flushes: this.snapshot.flushes + 1,
    });
  };
  reset = () => {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.emit({ facts: initialFacts(), queued: [], flushes: 0, lastBurst: 0 });
  };
  dispose = () => {
    clearTimeout(this.timer);
    this.listeners.clear();
  };
}
