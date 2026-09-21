import { createHash } from "node:crypto";
import { types } from "node:util";
import type { JsonValue } from "../types.js";
import { NativeRuntimeError } from "./errors.js";
import { unwrapHandle } from "./handles.js";

/** Canonical JSON: code-unit key order, dense arrays, data properties only. */
export function stableJson(
  value: unknown,
  path = "state",
  seen = new WeakSet<object>(),
  sortKeys = true,
): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value))
        throw invalid(path, "numbers must be finite");
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw invalid(path, typeof value + " is not JSON");
  }
  const object = value as object;
  const unwrapped = unwrapHandle(object);
  if (unwrapped !== object) return stableJson(unwrapped, path, seen, sortKeys);
  if (types.isProxy(object))
    throw invalid(path, "arbitrary proxies are not supported");
  if (seen.has(object)) throw invalid(path, "cyclic values are not supported");
  const array = Array.isArray(object);
  const prototype = Object.getPrototypeOf(object);
  if (
    array
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  )
    throw invalid(path, "only plain objects and arrays are supported");
  seen.add(object);
  try {
    const keys = Reflect.ownKeys(object);
    const data = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== "string")
        throw invalid(path, "symbol keys are not JSON");
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
      if (!("value" in descriptor))
        throw invalid(path + "." + key, "accessors are not supported");
      if (!descriptor.enumerable)
        throw invalid(
          path + "." + key,
          "non-enumerable properties are not supported",
        );
      data.set(key, descriptor.value);
    }
    if (array) {
      const length = (object as unknown[]).length;
      if (data.size !== length)
        throw invalid(
          path,
          "sparse arrays and extra array properties are not supported",
        );
      const values: string[] = [];
      for (let i = 0; i < length; i++) {
        if (!data.has(String(i)))
          throw invalid(path + "[" + i + "]", "array holes are not supported");
        values.push(
          stableJson(data.get(String(i)), path + "[" + i + "]", seen, sortKeys),
        );
      }
      return "[" + values.join(",") + "]";
    }
    const orderedKeys = [...data.keys()];
    if (sortKeys) orderedKeys.sort();
    return (
      "{" +
      orderedKeys
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            stableJson(data.get(key), path + "." + key, seen, sortKeys),
        )
        .join(",") +
      "}"
    );
  } finally {
    seen.delete(object);
  }
}
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
/** Validate, detach from caller-owned references, and freeze a JSON snapshot. */
export function snapshot<T>(value: T, path = "state"): T {
  return deepFreeze(
    JSON.parse(stableJson(value, path, new WeakSet(), false)) as T,
  );
}
export function asJson(value: unknown): JsonValue {
  return snapshot(value) as JsonValue;
}
function invalid(path: string, reason: string): NativeRuntimeError {
  return new NativeRuntimeError(
    "Invalid JSON value at " + path + ": " + reason + ".",
    "INVALID_STATE",
  );
}
