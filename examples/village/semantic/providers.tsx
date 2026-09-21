import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  JevProvider,
  SemanticScope,
  useAmbient,
  useChoice,
  useNoul,
  useScore,
  type JudgmentResult,
} from "../../../src/react/index.js";
import type { RuntimeAnswer, JsonValue } from "../../../src/types.js";
import { useSimulation } from "../simulation/provider.js";
import type { DistrictId } from "../simulation/world.js";
import {
  questions,
  villageInput,
  districtInput,
  familyInput,
  personInput,
  type SemanticInput,
} from "./contract.js";
import { SemanticRuntime } from "./runtime.js";
export type SemanticCell = JudgmentResult<RuntimeAnswer> & { scopeId: string };
const RuntimeContext = createContext<SemanticRuntime | null>(null);
export function RuntimeProvider({
  runtime,
  children,
}: {
  runtime: SemanticRuntime;
  children: ReactNode;
}) {
  return (
    <RuntimeContext.Provider value={runtime}>
      <JevProvider client={runtime}>{children}</JevProvider>
    </RuntimeContext.Provider>
  );
}
export function useRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("RuntimeProvider required");
  return runtime;
}
export function useSemanticTrace() {
  const runtime = useRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
export function answerValue(
  answer?: RuntimeAnswer,
): string | number | undefined {
  return answer?.type === "choice"
    ? answer.choice
    : answer?.type === "score"
      ? answer.score
      : answer?.noul;
}
export function useMeaning(key: string) {
  return useAmbient<SemanticCell>(key);
}
export function useVillageSemantics(input: SemanticInput) {
  const q = questions.village;
  const mood = useChoice(
    "village.mood",
    {
      state: input,
      question: q["village.mood"].instructions,
      options: q["village.mood"].criteria,
    },
    { debounceMs: 100 },
  );
  const concern = useChoice(
    "village.concern",
    {
      state: input,
      question: q["village.concern"].instructions,
      options: q["village.concern"].criteria,
    },
    { debounceMs: 100 },
  );
  const trust = useScore(
    "village.trust",
    {
      state: input,
      question: q["village.trust"].instructions,
      levels: q["village.trust"].criteria,
    },
    { debounceMs: 100 },
  );
  return {
    "village.mood": mood,
    "village.concern": concern,
    "village.trust": trust,
  };
}
function useVillageCells() {
  const mood = useMeaning("village.mood");
  const concern = useMeaning("village.concern");
  const trust = useMeaning("village.trust");
  return {
    "village.mood": mood,
    "village.concern": concern,
    "village.trust": trust,
  };
}
function useDistrictCells() {
  const village = useVillageCells();
  const mood = useMeaning("district.mood");
  const pressure = useMeaning("district.pressure");
  return { ...village, "district.mood": mood, "district.pressure": pressure };
}
function useFamilyCells() {
  const district = useDistrictCells();
  const stability = useMeaning("family.stability");
  const grievance = useMeaning("family.grievance");
  return {
    ...district,
    "family.stability": stability,
    "family.grievance": grievance,
  };
}
function projectInherited(cells: Record<string, SemanticCell | undefined>) {
  const inherited = Object.fromEntries(
    Object.entries(cells).map(([key, cell]) => [
      key,
      answerValue(cell?.data) ?? "pending",
    ]),
  ) as Record<string, JsonValue>;
  const ready = Object.values(cells).every(
    (cell) => cell?.data && !cell.pending && !cell.stale && !cell.error,
  );
  return { inherited, ready };
}
export function useDistrictSemantics(id: DistrictId, active: boolean) {
  const { world } = useSimulation();
  const { inherited, ready } = projectInherited(useVillageCells());
  const input = districtInput(world, id, inherited),
    q = questions.district;
  const options = { enabled: active && ready, debounceMs: 40 };
  const mood = useChoice(
    "district.mood",
    {
      state: input,
      question: q["district.mood"].instructions,
      options: q["district.mood"].criteria,
    },
    options,
  );
  const pressure = useChoice(
    "district.pressure",
    {
      state: input,
      question: q["district.pressure"].instructions,
      options: q["district.pressure"].criteria,
    },
    options,
  );
  return {
    input,
    ready,
    values: { "district.mood": mood, "district.pressure": pressure },
  };
}
export function useFamilySemantics(id: string, active: boolean) {
  const { world } = useSimulation();
  const { inherited, ready } = projectInherited(useDistrictCells());
  const input = familyInput(world, id, inherited),
    q = questions.family,
    options = { enabled: active && ready, debounceMs: 40 };
  const stability = useChoice(
    "family.stability",
    {
      state: input,
      question: q["family.stability"].instructions,
      options: q["family.stability"].criteria,
    },
    options,
  );
  const grievance = useChoice(
    "family.grievance",
    {
      state: input,
      question: q["family.grievance"].instructions,
      options: q["family.grievance"].criteria,
    },
    options,
  );
  return {
    input,
    ready,
    values: { "family.stability": stability, "family.grievance": grievance },
  };
}
export function usePersonSemantics(id: string, active: boolean) {
  const { world } = useSimulation();
  const { inherited, ready } = projectInherited(useFamilyCells());
  const input = personInput(world, id, inherited),
    q = questions.person,
    options = { enabled: active && ready, debounceMs: 40 };
  const attitude = useChoice(
    "person.attitude",
    {
      state: input,
      question: q["person.attitude"].instructions,
      options: q["person.attitude"].criteria,
    },
    options,
  );
  const secure = useNoul(
    "person.secure",
    { state: input, question: q["person.secure"].instructions },
    options,
  );
  return {
    input,
    ready,
    values: { "person.attitude": attitude, "person.secure": secure },
  };
}
function ValuesScope({
  input,
  values,
  blocked = false,
  children,
}: {
  input: SemanticInput;
  values: Record<string, JudgmentResult<RuntimeAnswer>>;
  blocked?: boolean;
  children: ReactNode;
}) {
  const signature = Object.values(values).flatMap((v) => [
    v.data,
    v.pending,
    v.stale,
    v.error,
    v.refetch,
  ]);
  const cells = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          {
            ...value,
            pending: blocked || value.pending,
            stale: blocked || value.stale,
            scopeId: input.scopeId,
          },
        ]),
      ),
    [input.scopeId, blocked, ...signature],
  );
  return (
    <SemanticScope values={{ ...cells, "scope.input": input }}>
      {children}
    </SemanticScope>
  );
}
export function VillageSemantics({ children }: { children: ReactNode }) {
  const { world } = useSimulation();
  const input = villageInput(world),
    values = useVillageSemantics(input);
  return (
    <ValuesScope input={input} values={values}>
      {children}
    </ValuesScope>
  );
}
export function DistrictSemantics({
  id,
  active,
  children,
}: {
  id: DistrictId;
  active: boolean;
  children: ReactNode;
}) {
  const { input, values, ready } = useDistrictSemantics(id, active);
  return (
    <ValuesScope input={input} values={values} blocked={!ready}>
      {children}
    </ValuesScope>
  );
}
export function FamilySemantics({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  const { input, values, ready } = useFamilySemantics(id, active);
  return (
    <ValuesScope input={input} values={values} blocked={!ready}>
      {children}
    </ValuesScope>
  );
}
export function PersonSemantics({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  const { input, values, ready } = usePersonSemantics(id, active);
  return (
    <ValuesScope input={input} values={values} blocked={!ready}>
      {children}
    </ValuesScope>
  );
}
