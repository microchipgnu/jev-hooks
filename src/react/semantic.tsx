"use client";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Values = Readonly<Record<string, unknown>>;
/** Lexical, per-key subscriptions: inner values shadow; missing keys inherit. */
export class SemanticStore {
  private listeners = new Map<string, Set<() => void>>();
  constructor(
    private values: Values,
    readonly parent?: SemanticStore,
  ) {}
  get = (key: string): unknown =>
    Object.hasOwn(this.values, key) ? this.values[key] : this.parent?.get(key);
  subscribe = (key: string, listener: () => void) => {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    const removeParent = this.parent?.subscribe(key, () => {
      if (!Object.hasOwn(this.values, key)) listener();
    });
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(key);
      removeParent?.();
    };
  };
  update(values: Values) {
    const keys = new Set([...Object.keys(this.values), ...Object.keys(values)]);
    const before = new Map([...keys].map((key) => [key, this.get(key)]));
    this.values = values;
    for (const key of keys)
      if (!Object.is(before.get(key), this.get(key)))
        this.listeners.get(key)?.forEach((listener) => listener());
  }
}
const Context = createContext<SemanticStore | undefined>(undefined);
export function SemanticScope({
  values,
  children,
}: {
  values: Values;
  children: ReactNode;
}) {
  const parent = useContext(Context);
  // The store is owned by this lexical scope. No global registration survives unmount.
  const store = useMemo(() => new SemanticStore(values, parent), [parent]);
  useLayoutEffect(() => store.update(values), [store, values]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useAmbient<T = unknown>(key: string): T | undefined {
  const store = useContext(Context);
  const subscribe = useMemo(
    () => (listener: () => void) =>
      store?.subscribe(key, listener) ?? (() => {}),
    [store, key],
  );
  const read = () => store?.get(key) as T | undefined;
  return useSyncExternalStore(subscribe, read, read);
}
