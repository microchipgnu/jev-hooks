import {
  StrictMode,
  useMemo,
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
} from "react";
import { createRoot } from "react-dom/client";
import {
  createJevClient,
  JevProvider,
  MockJudgmentAdapter,
  useChoice,
  useNoul,
  useScore,
  type JudgmentRequest,
} from "../../src/react/index.js";
import type { RuntimeAnswer } from "../../src/types.js";
import { DemoErrorNotice, useRetrySeconds } from "./error-notice.js";
import { createAtmosphereClient, DemoRateLimitError } from "./live-client.js";
import { Usage } from "./usage.js";
import type { DemoUsage } from "../shared/usage.js";
import "./style.css";

const live = import.meta.env.VITE_JEV_LIVE === "true";

/** Authored rules for a credential-free demo, not semantic inference. */
function mockAnswers(request: JudgmentRequest): Record<string, RuntimeAnswer> {
  const { message, energy } = request.state as {
    message: string;
    energy: number;
  };
  const calm = /quiet|calm|rain|soft|sleep|ocean/i.test(message);
  const intense = /bold|storm|intense|fire|loud|neon/i.test(message);
  const effective = calm
    ? Math.min(energy, 20)
    : intense
      ? Math.max(energy, 85)
      : energy;
  const mood = effective < 34 ? "calm" : effective > 70 ? "intense" : "playful";
  return Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      if (question.type === "choice")
        return [id, { type: "choice", choice: mood }];
      if (question.type === "noul")
        return [id, { type: "noul", noul: effective / 100 }];
      return [id, { type: "score", score: effective / 25 }];
    }),
  );
}

function Playground() {
  const [calls, setCalls] = useState(0);
  const [usage, setUsage] = useState<DemoUsage | null>(null);
  const [usageUnavailable, setUsageUnavailable] = useState(false);
  const receiveUsage = useCallback((next: DemoUsage) => {
    // A delayed poll must not replace newer counters delivered with a judgment.
    setUsage((previous) =>
      previous &&
      previous.since === next.since &&
      (previous.requests > next.requests ||
        previous.meteredCalls > next.meteredCalls ||
        previous.cacheHits > next.cacheHits ||
        previous.coalescedRequests > next.coalescedRequests)
        ? previous
        : next,
    );
    setUsageUnavailable(false);
  }, []);
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    let refreshing = false;
    const refresh = async () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      try {
        const response = await fetch("/api/usage", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Usage unavailable");
        receiveUsage(await response.json());
      } catch {
        if (!controller.signal.aborted) setUsageUnavailable(true);
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [receiveUsage]);
  const client = useMemo(
    () =>
      live
        ? createAtmosphereClient(
            () => setCalls((value) => value + 1),
            fetch,
            receiveUsage,
          )
        : createJevClient({
            adapter: new MockJudgmentAdapter(async (request) => {
              setCalls((value) => value + 1);
              await new Promise((resolve) => setTimeout(resolve, 350));
              return mockAnswers(request);
            }),
          }),
    [receiveUsage],
  );
  return (
    <JevProvider client={client}>
      <Atmosphere
        calls={calls}
        usage={usage}
        usageUnavailable={usageUnavailable}
      />
    </JevProvider>
  );
}

function Atmosphere({
  calls,
  usage,
  usageUnavailable,
}: {
  calls: number;
  usage: DemoUsage | null;
  usageUnavailable: boolean;
}) {
  const [message, setMessage] = useState("A little curiosity goes a long way.");
  const [energy, setEnergy] = useState(50);
  const [enabled, setEnabled] = useState(true);
  const state = { message, energy };
  const options = { debounceMs: live ? 650 : 300, enabled };
  const mood = useChoice(
    "mood",
    {
      state,
      question: "What atmosphere fits this moment?",
      options: {
        calm: "Quiet and reflective",
        playful: "Curious and playful",
        intense: "Bold and energetic",
      },
    },
    options,
  );
  const motion = useScore(
    "motion",
    {
      state,
      question: "How much movement fits this moment?",
      levels: ["Still", "Gentle", "Lively", "Fast", "Electric"],
    },
    options,
  );
  const excitement = useNoul(
    "excitement",
    { state, question: "Does this moment feel energetic?" },
    options,
  );
  const pending = mood.pending || motion.pending || excitement.pending;
  const error = mood.error ?? motion.error ?? excitement.error;
  const seconds = useRetrySeconds(error);
  const current = mood.data?.choice ?? "playful";
  const probability = Math.round((excitement.data?.noul ?? 0.5) * 100);
  const speed = motion.data?.score ?? 2;
  const presets = [
    {
      label: "Quiet morning",
      message: "Soft rain, a quiet room, nothing to rush.",
      energy: 18,
    },
    {
      label: "Happy accident",
      message: "A little curiosity goes a long way.",
      energy: 50,
    },
    {
      label: "After dark",
      message: "Neon lights and a bold idea. Turn it up.",
      energy: 92,
    },
  ];

  return (
    <main>
      <header className="topbar">
        <a href="#" className="wordmark">
          jev-hooks<span> / react</span>
        </a>
        <span className="badge">
          <i /> {live ? "LIVE JEV" : "LOCAL MOCK"}
        </span>
      </header>
      <section className="intro">
        <p className="eyebrow">EXPERIMENT 001</p>
        <h1>
          State becomes
          <br />
          <em>atmosphere.</em>
        </h1>
        <p className="lede">
          A small playground for reactive judgments.
          <br />
          Change the inputs. Watch the interface respond.
        </p>
      </section>
      <div className="lab">
        <section className="controls" aria-label="Experiment controls">
          <div className="section-heading">
            <span>01 / INPUT</span>
            <button
              className="text-button"
              onClick={() => setEnabled((value) => !value)}
            >
              {enabled ? "Pause judgments" : "Resume judgments"}
            </button>
          </div>
          {error && (
            <DemoErrorNotice
              error={error}
              seconds={seconds}
              onRetry={() => {
                setEnabled(true);
                mood.refetch();
                motion.refetch();
                excitement.refetch();
              }}
            />
          )}
          <label htmlFor="message">Set the scene</label>
          <textarea
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1000}
          />
          <div className="range-label">
            <label htmlFor="energy">Energy</label>
            <output htmlFor="energy">
              {energy}
              <span> / 100</span>
            </output>
          </div>
          <input
            id="energy"
            type="range"
            min="0"
            max="100"
            value={energy}
            onChange={(event) => setEnergy(Number(event.target.value))}
          />
          <div className="range-ends">
            <span>Slow down</span>
            <span>Turn it up</span>
          </div>
          <p className="preset-label">OR START WITH A FEELING</p>
          <div className="presets">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setMessage(preset.message);
                  setEnergy(preset.energy);
                }}
              >
                {preset.label}
                <span>↗</span>
              </button>
            ))}
          </div>
          <p className="mock-note">
            {live
              ? "Live Jev judgments via Cloudflare. Your scene is sent for inference; avoid sensitive text. Results are cached. Limited to 60 requests/minute and 1,000/day per IP."
              : "Mock mode uses simple keyword and energy rules. No AI calls, keys, or charges. Try “quiet”, “neon”, or your own text."}
          </p>
        </section>
        <section
          className={`scene ${current}`}
          style={
            { "--orbit-duration": `${14 - speed * 2.7}s` } as CSSProperties
          }
          aria-label="Reactive atmosphere"
        >
          <div className="scene-heading">
            <span>02 / RESPONSE</span>
            <span role="status" className="status">
              <i className={pending ? "working" : ""} />
              {!enabled
                ? "Paused"
                : pending
                  ? "Judging…"
                  : error instanceof DemoRateLimitError
                    ? seconds > 0
                      ? "Cooling down"
                      : "Ready to retry"
                    : error
                      ? "Update failed"
                      : "In sync"}
            </span>
          </div>
          <div className="orbital" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orb" />
            <span className="satellite" />
          </div>
          <div className="scene-copy">
            <p>THE MOMENT FEELS</p>
            <h2>{current}.</h2>
            <span>
              {current === "calm"
                ? "A little room to breathe."
                : current === "intense"
                  ? "Something is about to happen."
                  : "Leave a little space for surprise."}
            </span>
          </div>
          <div className="scene-footer">
            <span>useChoice → atmosphere</span>
            <span>useScore → motion</span>
          </div>
        </section>
      </div>
      <section className="readout" aria-label="Judgment results">
        <div>
          <span>CHOICE</span>
          <strong data-testid="mood">{current}</strong>
          <small>mood.data.choice</small>
        </div>
        <div>
          <span>NOUL</span>
          <strong data-testid="probability">
            {probability}
            <em>%</em>
          </strong>
          <small>probability of energetic</small>
        </div>
        <div>
          <span>SCORE</span>
          <strong>
            {speed.toFixed(1)}
            <em> / 4</em>
          </strong>
          <small>motion.data.score</small>
        </div>
        <div>
          <span>{live ? "YOUR REQUESTS" : "MOCK REQUESTS"}</span>
          <strong>{String(calls).padStart(2, "0")}</strong>
          <small>{live ? "650 ms debounce · cached" : "300 ms debounce"}</small>
        </div>
      </section>
      {live && <Usage usage={usage} unavailable={usageUnavailable} />}
      <section className="code-section">
        <div>
          <p className="eyebrow">THE REACTIVE LOOP</p>
          <h3>
            Your state.
            <br />A judgment.
            <br />A different feeling.
          </h3>
          <p>
            Each hook watches its declared state.
            <br />
            Previous answers stay visible while it updates.
          </p>
        </div>
        <pre>
          <code>
            <span className="code-muted">
              {"// Inside your React component\n"}
            </span>
            {
              'const mood = useChoice("mood", {\n  state: { message, energy },\n  question: "What atmosphere fits this moment?",\n  options: {\n    calm: "Quiet and reflective",\n    playful: "Curious and playful",\n    intense: "Bold and energetic",\n  },\n}, { debounceMs: 650 });\n\n'
            }
            <span className="code-accent">
              {"<Scene mood={mood.data?.choice} />"}
            </span>
          </code>
        </pre>
      </section>
      <footer>
        <span>jev-hooks · React state → judgments → UI</span>
        <span>Built for little experiments.</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
