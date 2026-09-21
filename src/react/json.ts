/** Canonical JSON for browser inputs. Does not invoke getters or toJSON methods. */
export function jsonKey(value: unknown): string {
  const seen = new WeakSet<object>();
  const visit = (item: unknown): string => {
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean")
      return JSON.stringify(item);
    if (typeof item === "number" && Number.isFinite(item))
      return JSON.stringify(item);
    if (typeof item !== "object")
      throw new TypeError("Jev state must be JSON data.");
    if (seen.has(item)) throw new TypeError("Jev state cannot contain cycles.");
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      throw new TypeError("Jev state must contain plain objects and arrays.");
    seen.add(item);
    try {
      const values = new Map<string, unknown>();
      for (const key of Reflect.ownKeys(item)) {
        if (array && key === "length") continue;
        if (typeof key !== "string")
          throw new TypeError("Jev state cannot contain symbol keys.");
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!("value" in descriptor) || !descriptor.enumerable)
          throw new TypeError(
            "Jev state cannot contain accessors or hidden properties.",
          );
        values.set(key, descriptor.value);
      }
      if (array) {
        if (values.size !== item.length)
          throw new TypeError(
            "Jev state cannot contain sparse arrays or extra array properties.",
          );
        return (
          "[" +
          Array.from({ length: item.length }, (_, i) => {
            if (!values.has(String(i)))
              throw new TypeError("Jev state cannot contain sparse arrays.");
            return visit(values.get(String(i)));
          }).join(",") +
          "]"
        );
      }
      return (
        "{" +
        [...values.keys()]
          .sort()
          .map((key) => JSON.stringify(key) + ":" + visit(values.get(key)))
          .join(",") +
        "}"
      );
    } finally {
      seen.delete(item);
    }
  };
  return visit(value);
}

export function freezeJson<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
}
