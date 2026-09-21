import { useState } from "react";
import worldPaths from "../assets/world-paths.json" with { type: "json" };
import attentionSource from "../semantic/attention.ts?raw";
import { useFacts } from "../events/provider.js";
import { useSemantic, useTransitions } from "../semantic/provider.js";
import { value } from "../semantic/hooks.js";
import { marketExposure, attentionQuestion } from "../semantic/contract.js";
import { attentionPolicy, alertThreshold } from "../semantic/attention.js";
import type { Cell } from "../semantic/hooks.js";

type Country = "jp" | "eu";
const names = { jp: "Japan", eu: "Europe" };
const pressureLabel = (score: number) =>
  score < 1
    ? "Normal"
    : score < 2
      ? "Elevated"
      : score < 2.7
        ? "Significant"
        : "Severe";
const sourceStart = attentionSource.indexOf(
  "export function useMarketAttention",
);
const policyStart = attentionSource.indexOf("export function attentionPolicy");
const policySource = attentionSource.slice(
  policyStart,
  attentionSource.indexOf("\n}", policyStart) + 2,
);
const source = attentionSource.slice(
  sourceStart,
  attentionSource.indexOf("\n}", sourceStart) + 2,
);

function BeforeAfter({
  cell,
  labels = false,
}: {
  cell: Cell;
  labels?: boolean;
}) {
  const transitions = useTransitions();
  const change = transitions.find(
    (t) =>
      t.semanticId === cell.id &&
      t.fingerprint === cell.fingerprint &&
      t.from !== null,
  );
  const format = (v: string | number) =>
    labels ? pressureLabel(Number(v)) : Number(v).toFixed(2);
  const current = value(cell.data);
  return (
    <span className="story-change" key={`${cell.fingerprint}:${cell.ready}`}>
      {cell.ready && change && change.from !== change.to && (
        <>
          <del>{format(change.from!)}</del>
          <i>→</i>
        </>
      )}
      <strong>{current === undefined ? "Waiting…" : format(current)}</strong>
    </span>
  );
}

/** An independent React consumer: no model decides whether to raise an alert. */
export function RegionConsequence({ country }: { country: Country }) {
  const attention = useSemantic(`${country}.attention.urgent`)!;
  const score = Number(value(attention.data));
  const policy = attention.data ? attentionPolicy(score) : undefined;
  return (
    <div
      className="story-consequence"
      data-policy={policy}
      data-pending={!attention.ready}
    >
      <span className="consequence-symbol" aria-hidden="true">
        {policy === "alert" ? "!" : "·"}
      </span>
      <div>
        <strong>
          {policy === "alert"
            ? `Review ${names[country]} exposure`
            : policy
              ? `Keep ${names[country]} on watch`
              : "Waiting for interpretation"}
        </strong>
        <small>
          {!attention.ready
            ? attention.error
              ? "Request failed · previous policy retained"
              : "Updating meaning · no new policy yet"
            : policy === "alert"
              ? "Added to the attention queue"
              : "No alert raised"}
        </small>
      </div>
    </div>
  );
}

/** A separate subscription branch reacts to the same answers as the region cards. */
export function AttentionStatus() {
  const japan = useSemantic("jp.attention.urgent")!;
  const europe = useSemantic("eu.attention.urgent")!;
  const active = [japan, europe].flatMap((cell, i) =>
    cell.data && attentionPolicy(Number(value(cell.data))) === "alert"
      ? [i === 0 ? "Japan" : "Europe"]
      : [],
  );
  const pending = !japan.ready || !europe.ready;
  return (
    <div className="story-queue" role="status" aria-label="Attention queue">
      <span>
        <i />
        ATTENTION QUEUE
      </span>
      <strong>
        {active.length
          ? active.join(" + ")
          : !japan.data && !europe.data
            ? "Awaiting interpretations"
            : "No regions need review"}
      </strong>
      <small>
        {pending
          ? japan.data || europe.data
            ? "Updating · last answers retained"
            : "Computing interpretations"
          : `${active.length} ${active.length === 1 ? "region" : "regions"} to review`}{" "}
        · separate React consumer
      </small>
    </div>
  );
}

function RegionBranch({
  country,
  selected,
  onSelect,
}: {
  country: Country;
  selected: boolean;
  onSelect: () => void;
}) {
  const facts = useFacts((world) => world.countries[country].markets);
  const attention = useSemantic(`${country}.attention.urgent`)!;
  const shared = useSemantic("global.markets.stress")!;
  return (
    <button
      className="story-region"
      aria-label={`Explain ${names[country]} attention`}
      aria-pressed={selected}
      onClick={onSelect}
      data-ready={attention.ready}
    >
      <div className="story-region-heading">
        <h3>{names[country]}</h3>
        <span>
          {country === "jp" ? "HIGHER" : "LOWER"} EXPOSURE ·{" "}
          {marketExposure[country]}
        </span>
      </div>
      <div className="story-local">
        <span>
          Local market <b>{String(facts.current.changePct)}%</b>
        </span>
        <em>
          {facts.eventIds.length === 0
            ? "FACTS UNCHANGED"
            : "LOCAL FACTS UPDATED"}
        </em>
      </div>
      <div className="story-question">
        <span>Does this region need attention?</span>
        <BeforeAfter cell={attention} />
      </div>
      <div className="story-probability">
        <i
          style={{
            width: `${Math.max(0, Number(value(attention.data)) || 0) * 100}%`,
          }}
        />
        <b
          style={{ left: `${alertThreshold * 100}%` }}
          title="Alert threshold 0.80"
        />
      </div>
      <p className="story-ready">
        {attention.ready
          ? "Interpretation ready · Noul 0–1"
          : shared.ready
            ? "Interpreting this region…"
            : "Waiting for shared pressure…"}
      </p>
      <RegionConsequence country={country} />
      <span className="story-region-inspect">
        {selected ? "Code shown alongside →" : "See this component’s code →"}
      </span>
    </button>
  );
}

export function CausalStory({
  onInspect,
}: {
  onInspect: (id: string) => void;
}) {
  const [country, setCountry] = useState<Country>("jp");
  const [mobilePane, setMobilePane] = useState("flow");
  const facts = useFacts((world) => world.countries.us.markets);
  const shared = useSemantic("global.markets.stress")!;
  const attention = useSemantic(`${country}.attention.urgent`)!;
  const previous = facts.history.at(-1)?.values.changePct;
  return (
    <section
      className="causal-story"
      data-pane={mobilePane}
      aria-label="Facts to consequences experiment"
    >
      <div className="story-mobile" role="group" aria-label="Experiment panes">
        <button
          aria-pressed={mobilePane === "flow"}
          onClick={() => setMobilePane("flow")}
        >
          Event → consequences
        </button>
        <button
          aria-pressed={mobilePane === "code"}
          onClick={() => setMobilePane("code")}
        >
          The running code
        </button>
      </div>
      <div className="story-stage">
        <svg
          className="story-world"
          viewBox="0 0 1000 440"
          role="img"
          aria-label="World map behind the semantic branches"
        >
          <defs>
            <radialGradient id="story-land">
              <stop stopColor="#7592ae" />
              <stop offset="1" stopColor="#253747" />
            </radialGradient>
          </defs>
          {worldPaths.map((path, i) => (
            <path
              key={i}
              d={path}
              fill="url(#story-land)"
              stroke="#7c9eb9"
              strokeWidth=".5"
            />
          ))}
          <path
            className="story-map-route"
            d="M235 146Q390 -10 515 154M235 146Q620 -60 883 140"
          />
          {[
            { x: 235, y: 146 },
            { x: 515, y: 154 },
            { x: 883, y: 140 },
          ].map((p) => (
            <circle key={p.x} cx={p.x} cy={p.y} r="5" fill="#aac9df" />
          ))}
        </svg>
        <div className="story-stage-content">
          <div className="story-stage-title">
            <span>ONE FACT. TWO INTERPRETATIONS.</span>
            <small>Follow the change ↓</small>
          </div>
          <button className="story-event" onClick={() => onInspect("event")}>
            <span className="causal-step">01 / FACT</span>
            <strong>
              US market{" "}
              {Number(facts.current.changePct) < 0 ? "falls" : "observation"}
            </strong>
            <span className="story-change">
              {previous !== undefined && (
                <>
                  <del>{String(previous)}%</del>
                  <i>→</i>
                </>
              )}
              <strong>{String(facts.current.changePct)}%</strong>
            </span>
            <small>
              {facts.eventIds.length
                ? "The only market observations changed by this replay"
                : "Send the US event above to begin"}
            </small>
          </button>
          <div
            className="story-wire"
            key={`wire:${shared.fingerprint}:${shared.ready}`}
            data-pending={!shared.ready}
          >
            <span>facts → useScore</span>
          </div>
          <button
            className="story-shared"
            onClick={() => onInspect("global.markets.stress")}
            data-pending={!shared.ready}
          >
            <span className="causal-step">02 / SHARED MEANING</span>
            <BeforeAfter cell={shared} labels />
            <span>
              Economic pressure{" "}
              <b>
                {shared.data ? Number(value(shared.data)).toFixed(2) : "…"} / 3
              </b>
            </span>
            <small>
              {shared.ready
                ? "SemanticScope makes this available to both components"
                : "Reinterpreting facts · dependent hooks wait"}
            </small>
          </button>
          <div
            className="story-fork"
            key={`fork:${shared.fingerprint}:${shared.ready}`}
            data-pending={!shared.ready}
          >
            <span>useAmbient("pressure")</span>
            <i />
            <b />
            <em />
          </div>
          <div className="story-regions">
            <RegionBranch
              country="jp"
              selected={country === "jp"}
              onSelect={() => {
                setCountry("jp");
                setMobilePane("code");
              }}
            />
            <RegionBranch
              country="eu"
              selected={country === "eu"}
              onSelect={() => {
                setCountry("eu");
                setMobilePane("code");
              }}
            />
          </div>
          <AttentionStatus />
          <p className="story-caveat">
            Fictional exposure assumptions. Derived attention is an
            interpretation, not a report of foreign losses.
          </p>
        </div>
      </div>
      <aside className="story-code" aria-label="Running component explanation">
        <div className="story-code-heading">
          <span>03 / INDEPENDENT COMPONENT</span>
          <h2>{names[country]} interprets the signal.</h2>
          <p>
            {facts.eventIds.length
              ? "Its facts stayed the same. Its context changed."
              : "Local exposure + shared context → local meaning."}
          </p>
        </div>
        <div className="story-bindings">
          <span>
            shared pressure{" "}
            <b>{shared.data ? Number(value(shared.data)).toFixed(2) : "…"}</b>
          </span>
          <span>
            local exposure <b>{marketExposure[country]}</b>
          </span>
        </div>
        <div className="story-source" aria-label="Running attention hook">
          <div className="story-source-caption">
            ACTUAL SOURCE · useMarketAttention
          </div>
          <pre>
            <code>
              {source.split("\n").map((line, i) => (
                <span
                  key={`${i}:${line.includes("pressure") ? shared.fingerprint : ""}`}
                  className={
                    line.includes("pressure")
                      ? "source-dependency"
                      : line.includes("useNoul")
                        ? "source-hook"
                        : ""
                  }
                >
                  {line}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
        </div>
        <div
          className="story-answer"
          key={`${country}:${attention.fingerprint}:${attention.ready}`}
          data-ready={attention.ready}
        >
          <span>JEV ANSWER</span>
          <strong>
            {attention.data ? Number(value(attention.data)).toFixed(2) : "…"}
          </strong>
          <small>
            {attention.ready
              ? "Current interpretation"
              : attention.status === "blocked"
                ? "Waiting for upstream meaning"
                : attention.data
                  ? "Computing · previous answer retained"
                  : "Computing interpretation"}
          </small>
        </div>
        <div className="story-policy">
          <span>04 / ORDINARY CODE CHOOSES THE CONSEQUENCE</span>
          <pre>{`const alertThreshold = ${alertThreshold};\n\n${policySource}`}</pre>
          <p>The hook interprets. This rule decides what the UI does.</p>
        </div>
        <details className="story-question-detail">
          <summary>What exactly does Jev judge?</summary>
          <p>{attentionQuestion}</p>
          <p>
            pressure is a projected semantic reference. Its SDK metadata creates
            the edge. No judgment name or dependsOn list wires this dependency.
            The public demo maps these two fields into its fixed, validated
            endpoint schema.
          </p>
        </details>
        <button
          className="story-inspect"
          onClick={() => onInspect(`${country}.attention.urgent`)}
        >
          Inspect evidence, distribution & execution ↗
        </button>
      </aside>
    </section>
  );
}
