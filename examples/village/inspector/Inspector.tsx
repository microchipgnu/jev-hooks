import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAmbient } from "../../../src/react/index.js";
import type { RuntimeAnswer } from "../../../src/types.js";
import { useSimulation } from "../simulation/provider.js";
import { scopePath, scopeName } from "../simulation/world.js";
import { useLens } from "../scene/lens.js";
import { behaviorFor } from "../scene/behavior.js";
import {
  useMeaning,
  useSemanticTrace,
  useRuntime,
  answerValue,
} from "../semantic/providers.js";
import {
  questions,
  semanticKeys,
  dependencies,
  passFor,
  type SemanticInput,
  type ScopeKind,
} from "../semantic/contract.js";
import { fingerprint } from "../semantic/runtime.js";
import { DemoErrorNotice, useRetrySeconds } from "../../react/error-notice.js";
import hooksSource from "../semantic/providers.tsx?raw";
import scopeSource from "../../../src/react/semantic.tsx?raw";

type InspectorContext = { target: HTMLElement | null; dev: boolean };
const Context = createContext<InspectorContext>({ target: null, dev: false });
export function InspectorHost({
  target,
  dev,
  children,
}: InspectorContext & { children: ReactNode }) {
  return (
    <Context.Provider value={{ target, dev }}>{children}</Context.Provider>
  );
}
export const consumers: Record<string, string[]> = {
  "village.mood": [
    "TopStatus",
    "VillageAtmosphere",
    "Timeline",
    "DistrictSemantics",
  ],
  "village.concern": [
    "TopStatus",
    "DistrictVisual",
    "PersonBehavior",
    "Timeline",
    "DistrictSemantics",
  ],
  "village.trust": ["TopStatus", "ActionBar", "DistrictSemantics"],
  "district.mood": ["DistrictVisual", "PersonBehavior", "FamilySemantics"],
  "district.pressure": ["DistrictVisual", "PersonBehavior", "FamilySemantics"],
  "family.stability": ["FamilyVisual", "PersonSemantics"],
  "family.grievance": ["FamilyVisual", "PersonSemantics"],
  "person.attitude": ["PersonBehavior", "PersonVisual"],
  "person.secure": ["PersonVisual"],
};
export function valueLabel(answer?: RuntimeAnswer) {
  const v = answerValue(answer);
  return v === undefined
    ? "Not derived"
    : typeof v === "number"
      ? answer?.type === "noul"
        ? `${Math.round(v * 100)}% yes`
        : `${v.toFixed(2)} / 2`
      : v;
}
function SemanticRow({
  semanticKey,
  inherited,
  dev,
}: {
  semanticKey: string;
  inherited: boolean;
  dev: boolean;
}) {
  const cell = useMeaning(semanticKey);
  if (!cell) return null;
  const [kind] = semanticKey.split(".") as [ScopeKind];
  const definition = (questions[kind] as Record<string, unknown>)[semanticKey];
  const answer = cell.data;
  const distribution =
    answer && "probabilities" in answer
      ? answer.probabilities
      : answer?.type === "noul"
        ? { yes: answer.noul, no: 1 - answer.noul }
        : undefined;
  return (
    <div
      className={`semantic-row ${inherited ? "inherited" : "local"} ${cell.stale ? "is-stale" : ""}`}
    >
      <div className="semantic-row-label">
        <span>
          {inherited ? "↓" : "◆"} {semanticKey}
        </span>
        <b>{valueLabel(answer)}</b>
      </div>
      <small>
        {cell.error
          ? "Could not derive"
          : cell.pending
            ? answer
              ? "Previous answer · refreshing…"
              : "Awaiting derivation…"
            : cell.stale
              ? "Previous input · stale"
              : `from ${cell.scopeId}`}
        {answer && "confidence" in answer && answer.confidence !== undefined
          ? ` · confidence ${answer.confidence.toFixed(2)}`
          : ""}
      </small>
      {dev && (
        <details>
          <summary>Question & distribution</summary>
          <p className="question-text">
            {(definition as { instructions: string }).instructions}
          </p>
          {distribution ? (
            <div className="distribution">
              {Object.entries(distribution).map(([key, probability]) => (
                <div key={key}>
                  <span>
                    {answer?.type === "score"
                      ? (answer.legend?.[Number(key)] ?? key)
                      : key}
                  </span>
                  <i>
                    <em style={{ width: `${probability * 100}%` }} />
                  </i>
                  <b>{probability.toFixed(3)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p>No distribution returned by the provider.</p>
          )}
          <pre>{JSON.stringify({ question: definition, answer }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
export function SemanticBreadcrumb() {
  const { world } = useSimulation(),
    lens = useLens();
  const mood = useMeaning("village.mood"),
    district = useMeaning("district.mood"),
    family = useMeaning("family.stability"),
    person = useMeaning("person.attitude");
  const path = scopePath(lens.selected, world),
    cells = [mood, district, family, person];
  return (
    <nav className="semantic-breadcrumb" aria-label="Semantic breadcrumb">
      {path.map((id, i) => (
        <div key={id}>
          <span>
            {i > 0 && <i>›</i>}
            {scopeName(id, world)}
          </span>
          <b>{cells[i]?.data ? valueLabel(cells[i]?.data) : "…"}</b>
        </div>
      ))}
    </nav>
  );
}
function CodeView({ kind }: { kind: ScopeKind }) {
  const name = `use${kind[0]!.toUpperCase()}${kind.slice(1)}Semantics`;
  const start = hooksSource.indexOf(`export function ${name}`);
  const end = hooksSource.indexOf("\n}", start) + 2;
  return (
    <div className="code-view">
      <p>Exact source · semantic/providers.tsx</p>
      <pre>{hooksSource.slice(start, end)}</pre>
      <details>
        <summary>How useAmbient inherits</summary>
        <pre>{scopeSource}</pre>
      </details>
    </div>
  );
}
function Inspector({ scopeId }: { scopeId: string }) {
  const { dev } = useContext(Context),
    { world } = useSimulation(),
    lens = useLens();
  const input = useAmbient<SemanticInput>("scope.input")!,
    snapshot = useSemanticTrace(),
    runtime = useRuntime();
  const mood = useMeaning("village.mood"),
    concern = useMeaning("village.concern"),
    trust = useMeaning("village.trust"),
    grievance = useMeaning("family.grievance"),
    secure = useMeaning("person.secure"),
    districtMood = useMeaning("district.mood"),
    pressure = useMeaning("district.pressure"),
    family = useMeaning("family.stability"),
    attitude = useMeaning("person.attitude");
  const localFirst =
    input.kind === "village"
      ? mood
      : input.kind === "district"
        ? districtMood
        : input.kind === "family"
          ? family
          : attitude;
  const cells = [
    mood,
    concern,
    trust,
    districtMood,
    pressure,
    family,
    grievance,
    attitude,
    secure,
  ];
  const error = cells.find((cell) => cell?.error)?.error;
  const seconds = useRetrySeconds(error),
    [tab, setTab] = useState<"meaning" | "trace" | "code">("meaning");
  const [kind, id = ""] = scopeId.split(":");
  const person = kind === "person" ? world.people[id] : undefined;
  const behavior = person
    ? behaviorFor(
        person.occupation,
        answerValue(concern?.data),
        answerValue(districtMood?.data),
        answerValue(pressure?.data),
        answerValue(attitude?.data),
      )
    : undefined;
  const local = Object.keys(questions[input.kind]),
    inherited = semanticKeys.filter(
      (key) => !local.includes(key) && dependencies[input.kind].includes(key),
    );
  const currentTrace = snapshot.traces.find(
    (t) => t.scopeId === scopeId && t.stateFingerprint === fingerprint(input),
  );
  return (
    <>
      <SemanticBreadcrumb />
      <header className="inspector-heading">
        <div>
          <span className="eyebrow">
            SEMANTIC LENS · {lens.pinned ? "PINNED" : "HOVER"}
          </span>
          <h2>{scopeName(scopeId, world)}</h2>
          <p>
            {person
              ? `${person.occupation} · ${world.districts[person.districtId].name} · ${world.families[person.familyId]?.name} family`
              : `${input.kind} scope · ${local.length} typed judgments`}
          </p>
        </div>
        <button
          className="icon-button"
          onClick={() => (lens.pinned ? lens.unpin() : lens.pin(scopeId))}
          aria-label={lens.pinned ? "Unpin lens" : "Pin lens"}
        >
          {lens.pinned ? "Unpin" : "Pin"}
        </button>
      </header>
      <div className="inspector-mode">
        <span
          className={runtime.mode === "mock" ? "simulated-dot" : "live-dot"}
        />
        {runtime.mode === "mock" ? "SIMULATED SEMANTICS" : "LIVE JEV"}
        <span>
          {localFirst?.pending
            ? "Deriving…"
            : localFirst?.stale
              ? "Stale"
              : "Ready"}
        </span>
      </div>
      {error && (
        <DemoErrorNotice
          error={error}
          seconds={seconds}
          onRetry={() => {
            cells
              .filter((cell) => cell?.error)
              .forEach((cell) => cell?.refetch());
          }}
        />
      )}
      {dev && (
        <div className="inspector-tabs" role="tablist">
          {(["meaning", "trace", "code"] as const).map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {!dev || tab === "meaning" ? (
        <div className="inspector-body">
          {inherited.length > 0 && (
            <section>
              <h3>↓ Inherited meaning</h3>
              {inherited.map((key) => (
                <SemanticRow key={key} semanticKey={key} inherited dev={dev} />
              ))}
            </section>
          )}
          <section>
            <h3>01 / Facts · deterministic</h3>
            <dl className="facts-list">
              {Object.entries(input.facts)
                .filter(([, value]) => !Array.isArray(value))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                    <dd>
                      {typeof value === "boolean"
                        ? value
                          ? "yes"
                          : "no"
                        : String(value)}
                    </dd>
                  </div>
                ))}
            </dl>
            {dev && (
              <details>
                <summary>Exact input state</summary>
                <pre>{JSON.stringify(input, null, 2)}</pre>
              </details>
            )}
          </section>
          <section>
            <h3>02 / Meaning · derived here</h3>
            {local.map((key) => (
              <SemanticRow
                key={key}
                semanticKey={key}
                inherited={false}
                dev={dev}
              />
            ))}
          </section>
          <section>
            <h3>03 / Behavior · ordinary code</h3>
            {behavior ? (
              <p className="behavior-label">{behavior.label}</p>
            ) : (
              <p className="inspector-caption">
                {input.kind === "village"
                  ? "Atmosphere, the status strip, timeline emphasis and action guidance each read their own ambient keys."
                  : input.kind === "district"
                    ? "Local stalls, supplies and activity respond to district meaning. Village context still reaches every resident."
                    : "The household marker reflects stability. Each resident can derive their own attitude inside this scope."}
              </p>
            )}
            <div className="consumer-tags">
              {[...new Set(local.flatMap((key) => consumers[key] ?? []))].map(
                (name) => (
                  <span key={name}>{name}</span>
                ),
              )}
            </div>
          </section>
          {dev && (
            <section className="batch-summary">
              <h3>Jev hooks · pass {passFor[input.kind]}</h3>
              <b>
                {local.length} judgments →{" "}
                {currentTrace?.cached === "browser"
                  ? "0 requests · browser cache"
                  : "1 compatible batch"}
              </b>
              <p>
                {currentTrace
                  ? `${currentTrace.id} · ${currentTrace.durationMs} ms · ${currentTrace.cached === "none" ? "fresh derivation" : `${currentTrace.cached} cache`}`
                  : "Waiting for declared dependencies"}
              </p>
              <code>{fingerprint(input)}</code>
            </section>
          )}
        </div>
      ) : tab === "code" ? (
        <CodeView kind={input.kind} />
      ) : (
        <div className="trace-view">
          <p className="inspector-caption">
            Passes are dependency depths. Only inspected branches run.
            Fingerprints label the exact inputs below.
          </p>
          {scopePath(scopeId, world).map((id, i) => {
            const trace = snapshot.traces.find((t) => t.scopeId === id);
            return (
              <div className="dependency-node" key={id}>
                <small>
                  PASS {i + 1} · {scopeName(id, world)}
                </small>
                <b>
                  {trace ? `${trace.id} · ${trace.status}` : "Not requested"}
                </b>
                <span>
                  {trace
                    ? `${Object.keys(trace.questions).length} judgments · ${trace.cached === "browser" ? "0 network calls" : "1 batch"} · ${trace.durationMs} ms`
                    : "Waiting on ancestors"}
                </span>
              </div>
            );
          })}
          <h3>Recent derivations</h3>
          {snapshot.traces.slice(0, 20).map((trace) => (
            <details key={trace.id} className={`trace-item ${trace.status}`}>
              <summary>
                <span>
                  {trace.id} · {trace.scopeId}
                </span>
                <b>
                  {trace.cached !== "none"
                    ? `${trace.cached} cache`
                    : trace.status}
                </b>
              </summary>
              {trace.invalidated.length > 0 && (
                <p className="invalidated">
                  Inputs changed → {trace.invalidated.join(", ")} invalidated
                </p>
              )}
              <p>
                {trace.model} · {trace.source} · {trace.durationMs} ms ·
                generation {trace.generation}
              </p>
              <pre>{JSON.stringify(trace, null, 2)}</pre>
            </details>
          ))}
        </div>
      )}
      <p className="inspector-footer">
        Move the lens to inspect. Click a building, family label or villager to
        pin. Esc releases it.
      </p>
    </>
  );
}
export function LensPortal({ scopeId }: { scopeId: string }) {
  const { target } = useContext(Context),
    lens = useLens();
  return target && lens.selected === scopeId
    ? createPortal(<Inspector key={scopeId} scopeId={scopeId} />, target)
    : null;
}
