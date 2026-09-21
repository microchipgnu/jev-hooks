// Weak metadata does not become part of state, JSON, or the public answer shape.
const handles = new WeakMap<object, () => unknown>();
export function registerHandle(handle: object, resolve: () => unknown): void {
  handles.set(handle, resolve);
}
export function unwrapHandle(value: object): unknown {
  const resolve = handles.get(value);
  return resolve ? resolve() : value;
}
