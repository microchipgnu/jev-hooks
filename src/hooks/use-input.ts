import { session } from "../runtime/session.js";
export function useInput<T = unknown>(id: string): T {
  return session().inputValue<T>(id);
}
