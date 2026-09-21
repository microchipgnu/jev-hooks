import type { JsonValue } from "../types.js";
import type { JevClient } from "./client.js";
import { freezeJson, jsonKey } from "./json.js";

export type SemanticDependency = {
  readonly id: string;
  readonly label?: string;
  readonly pass: number;
};
export type SemanticInfo = SemanticDependency & {
  readonly dependencies: readonly SemanticDependency[];
  readonly input: JsonValue;
  readonly status: "blocked" | "pending" | "ready" | "error" | "disabled";
};
declare const semanticReferenceBrand: unique symbol;
/** A render snapshot with runtime identity. Pass it into state to declare an edge. */
export interface SemanticReference<T> {
  readonly [semanticReferenceBrand]: T;
  readonly semantic: SemanticInfo;
  /** Pure projection: retains readiness and lineage while narrowing downstream input. */
  select<U extends JsonValue>(select: (answer: T) => U): SemanticReference<U>;
}
type Entry = {
  ready: boolean;
  data: unknown;
  error?: Error;
  client: JevClient;
};
const references = new WeakMap<object, Entry>();
export function reference<T, R extends object>(
  result: R,
  semantic: SemanticInfo,
  entry: Entry,
): R & SemanticReference<T> {
  const value = Object.assign(result, {
    semantic: freezeJson(semantic),
    select<U extends JsonValue>(
      select: (answer: T) => U,
    ): SemanticReference<U> {
      const data = entry.ready ? select(entry.data as T) : undefined;
      if (entry.ready) jsonKey(data);
      return reference<U, object>({}, semantic, { ...entry, data });
    },
  });
  references.set(value, entry);
  return Object.freeze(value) as R & SemanticReference<T>;
}

/** Resolve only registered references. Never invoke user getters or toJSON. */
export function resolveSemanticState(state: unknown, client: JevClient) {
  const dependencies = new Map<string, SemanticDependency>();
  const seen = new WeakSet<object>();
  let ready = true;
  let error: Error | undefined;
  const visit = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    const entry = references.get(value);
    if (entry) {
      if (entry.client !== client)
        throw new TypeError(
          "Semantic dependencies must use the same Jev client.",
        );
      const info = (value as SemanticReference<unknown>).semantic;
      dependencies.set(info.id, {
        id: info.id,
        label: info.label,
        pass: info.pass,
      });
      ready &&= entry.ready;
      error ??= entry.error;
      return entry.ready ? entry.data : null;
    }
    if (seen.has(value))
      throw new TypeError("Jev state cannot contain cycles.");
    const prototype = Object.getPrototypeOf(value);
    const array = Array.isArray(value);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      throw new TypeError("Jev state must contain plain objects and arrays.");
    seen.add(value);
    try {
      const entries: [string, unknown][] = [];
      for (const key of Reflect.ownKeys(value)) {
        if (array && key === "length") continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (
          typeof key !== "string" ||
          !("value" in descriptor) ||
          !descriptor.enumerable
        )
          throw new TypeError(
            "Jev state cannot contain accessors, symbols or hidden properties.",
          );
        entries.push([key, visit(descriptor.value)]);
      }
      if (array) {
        if (
          entries.length !== value.length ||
          entries.some(([key], i) => key !== String(i))
        )
          throw new TypeError(
            "Jev state cannot contain sparse arrays or extra array properties.",
          );
        return entries.map(([, item]) => item);
      }
      return Object.fromEntries(entries);
    } finally {
      seen.delete(value);
    }
  };
  const input = JSON.parse(jsonKey(visit(state))) as JsonValue;
  return { input, dependencies: [...dependencies.values()], ready, error };
}
