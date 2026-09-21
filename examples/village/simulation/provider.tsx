import { createContext, useContext, useReducer, type ReactNode } from "react";
import {
  reduceWorld,
  seedWorld,
  type Action,
  type VillageState,
} from "./world.js";
const Context = createContext<{
  world: VillageState;
  dispatch: (action: Action) => void;
} | null>(null);
export function SimulationProvider({ children }: { children: ReactNode }) {
  const [world, dispatch] = useReducer(reduceWorld, undefined, seedWorld);
  return (
    <Context.Provider value={{ world, dispatch }}>{children}</Context.Provider>
  );
}
export function useSimulation() {
  const context = useContext(Context);
  if (!context) throw new Error("SimulationProvider required");
  return context;
}
