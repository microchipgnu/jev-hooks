import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { EventRuntime } from "./runtime.js";
import type { WorldFacts } from "./model.js";
const Context = createContext<EventRuntime | null>(null);
export function EventRuntimeProvider({
  runtime,
  children,
}: {
  runtime: EventRuntime;
  children: ReactNode;
}) {
  return <Context.Provider value={runtime}>{children}</Context.Provider>;
}
export function useEvents() {
  const runtime = useContext(Context);
  if (!runtime) throw new Error("EventRuntimeProvider required");
  return runtime;
}
export function useEventSnapshot() {
  const store = useEvents();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
export function useFacts<T>(selector: (facts: WorldFacts) => T) {
  const store = useEvents();
  const read = () => selector(store.getSnapshot().facts);
  return useSyncExternalStore(store.subscribe, read, read);
}
