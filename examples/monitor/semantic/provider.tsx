import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  JevProvider,
  SemanticScope,
  useAmbient,
} from "../../../src/react/index.js";
import { useFacts } from "../events/provider.js";
import { useWorldSemanticGraph, value, type Cell } from "./hooks.js";
import { groups, evidenceIds, type MonitorInput } from "./contract.js";
import { MarketScope, MarketComposition } from "./markets.js";
import type { useGlobalMarketSemantic, MarketExposure } from "./hooks.js";
import type { MonitorRuntime } from "./runtime.js";
export type Transition = {
  id: string;
  semanticId: string;
  from: string | number | null;
  to: string | number;
  timestamp: string;
  observedAt: number;
  triggeringChanges: string[];
  eventIds: string[];
  fingerprint: string;
  source: "mock" | "jev";
};
class SemanticHistory {
  private listeners = new Set<() => void>();
  private values = new Map<
    string,
    { value: string | number; fingerprint: string; input: MonitorInput }
  >();
  private transitions: readonly Transition[] = [];
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.transitions;
  commit(
    cells: Record<string, Cell>,
    timestamp: string,
    source: "mock" | "jev",
  ) {
    const changes: Transition[] = [];
    for (const cell of Object.values(cells)) {
      if (!cell.ready) continue;
      const next = value(cell.data)!;
      const prior = this.values.get(cell.id);
      if (prior?.fingerprint === cell.fingerprint) continue;
      if (prior?.value !== next)
        changes.push({
          id: `${cell.id}:${cell.fingerprint}:${Date.now()}`,
          semanticId: cell.id,
          from: prior?.value ?? null,
          to: next,
          timestamp,
          observedAt: Date.now(),
          triggeringChanges: [
            ...cell.dependencies.filter(
              (id) =>
                !prior ||
                prior.input.inherited[id] !== cell.input.inherited[id],
            ),
            ...(JSON.stringify(prior?.input.facts) !==
            JSON.stringify(cell.input.facts)
              ? groups[cell.input.scopeId]!.facts.map((path) => `${path} facts`)
              : []),
          ],
          eventIds: evidenceIds(cell.input),
          fingerprint: cell.fingerprint,
          source,
        });
      this.values.set(cell.id, {
        value: next,
        fingerprint: cell.fingerprint,
        input: cell.input,
      });
    }
    if (changes.length) {
      this.transitions = [...changes.reverse(), ...this.transitions].slice(
        0,
        300,
      );
      this.listeners.forEach((fn) => fn());
    }
  }
}
const GraphContext = createContext<{
  cells: Record<string, Cell>;
  runtime: MonitorRuntime;
  history: SemanticHistory;
} | null>(null);
function Graph({
  runtime,
  children,
  globalMarkets,
  japanExposure,
  europeExposure,
}: {
  runtime: MonitorRuntime;
  children: ReactNode;
  globalMarkets: ReturnType<typeof useGlobalMarketSemantic>;
  japanExposure: MarketExposure;
  europeExposure: MarketExposure;
}) {
  const facts = useFacts((f) => f),
    cells = useWorldSemanticGraph(
      facts,
      globalMarkets,
      japanExposure,
      europeExposure,
    ),
    history = useMemo(() => new SemanticHistory(), [runtime]);
  useEffect(() => {
    history.commit(cells, facts.clock, runtime.source);
  }, [cells, facts.clock, history, runtime]);
  const ambient = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(cells).flatMap(([id, cell]) => [
          [id, cell.reference],
          [`inspection:${id}`, cell],
        ]),
      ),
    [cells],
  );
  return (
    <GraphContext.Provider value={{ cells, runtime, history }}>
      <SemanticScope values={ambient}>{children}</SemanticScope>
    </GraphContext.Provider>
  );
}
export function SemanticGraphProvider({
  runtime,
  children,
}: {
  runtime: MonitorRuntime;
  children: ReactNode;
}) {
  return (
    <JevProvider client={runtime}>
      <MarketScope>
        <MarketComposition>
          {(globalMarkets, japanExposure, europeExposure) => (
            <Graph
              runtime={runtime}
              globalMarkets={globalMarkets}
              japanExposure={japanExposure}
              europeExposure={europeExposure}
            >
              {children}
            </Graph>
          )}
        </MarketComposition>
      </MarketScope>
    </JevProvider>
  );
}
export function useSemantic(id: string) {
  return useAmbient<Cell>(`inspection:${id}`);
}
export function useGraph() {
  const ctx = useContext(GraphContext);
  if (!ctx) throw new Error("SemanticGraphProvider required");
  return ctx;
}
export function useTrace() {
  const { runtime } = useGraph();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
export function useTransitions() {
  const { history } = useGraph();
  return useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
    history.getSnapshot,
  );
}
export function CountryScope({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  const situation = useSemantic(`${scope}.situation`),
    severity = useSemantic(`${scope}.severity`),
    urgency = useSemantic(`${scope}.urgency`),
    trend = useSemantic(`${scope}.trend`);
  return (
    <SemanticScope
      values={{
        "scope.id": scope,
        situation: situation?.reference,
        severity: severity?.reference,
        urgency: urgency?.reference,
        trend: trend?.reference,
      }}
    >
      {children}
    </SemanticScope>
  );
}
