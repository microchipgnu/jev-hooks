import { requestSchema } from "../transport/http.js";
import type {
  JudgmentDeclaration,
  JudgmentDependency,
  JudgmentValue,
  JsonValue,
  RuntimeAnswer,
  RuntimeQuestion,
} from "../types.js";
import { fingerprint, snapshot } from "./fingerprint.js";
import { registerHandle } from "./handles.js";
import { NativeRuntimeError, PendingRead } from "./errors.js";

let active: EvaluationSession | undefined;
export function withSession<T>(session: EvaluationSession, work: () => T): T {
  if (active)
    throw new NativeRuntimeError(
      "Nested program evaluation is not supported.",
      "NESTED_EVALUATION",
    );
  active = session;
  try {
    return work();
  } finally {
    active = undefined;
  }
}
export function session(): EvaluationSession {
  if (!active)
    throw new NativeRuntimeError(
      "Jev hooks can only run while run() evaluates a program.",
      "OUTSIDE_RUN",
    );
  return active;
}
export class EvaluationSession {
  readonly declarations = new Map<string, JudgmentDeclaration>();
  readonly reads: {
    id: string;
    fingerprint: string;
    field: string;
    status: "pending" | "resolved";
  }[] = [];
  suspendedOn?: string;
  private readonly dependencies = new Map<
    string,
    { id: string; fingerprint: string; fields: Set<string> }
  >();
  private closed = false;
  private automaticSequence = 0;
  nextId(): string {
    return `jev:auto:${++this.automaticSequence}`;
  }
  constructor(
    readonly input: Readonly<Record<string, unknown>>,
    private readonly answers: ReadonlyMap<string, RuntimeAnswer>,
  ) {}
  close(): void {
    this.closed = true;
  }
  inputValue<T>(id: string): T {
    if (!Object.hasOwn(this.input, id))
      throw new NativeRuntimeError(
        'Missing input "' + id + '".',
        "MISSING_INPUT",
      );
    return this.input[id] as T;
  }
  judgment<T extends RuntimeAnswer>(
    id: string,
    state: JsonValue,
    question: RuntimeQuestion,
  ): JudgmentValue<T> {
    if (typeof id !== "string" || !id.trim())
      throw new NativeRuntimeError(
        "Judgment IDs must be nonempty strings.",
        "INVALID_JUDGMENT",
      );
    // Validate all adapters' inputs, including mocks, before any inference.
    requestSchema.shape.questions.parse({ [id]: question });
    const declaration: JudgmentDeclaration = {
      id,
      state: snapshot(state),
      question: snapshot(question),
      stateFingerprint: fingerprint(state),
      fingerprint: fingerprint({ id, question, state }),
      dependencies: this.knownDependencies().filter((item) => item.id !== id),
    };
    const previous = this.declarations.get(id);
    if (previous && previous.fingerprint !== declaration.fingerprint)
      throw new NativeRuntimeError(
        'Duplicate judgment ID "' +
          id +
          '" has incompatible definitions: ' +
          JSON.stringify(previous) +
          " versus " +
          JSON.stringify(declaration),
        "DUPLICATE_JUDGMENT",
      );
    this.declarations.set(id, declaration);
    const read = (field: string): RuntimeAnswer => {
      if (this.closed)
        throw new NativeRuntimeError(
          'Answer "' +
            id +
            '" escaped its evaluation pass. Return its data; do not capture hook handles.',
          "STALE_ANSWER",
        );
      const answer = this.answers.get(declaration.fingerprint);
      this.reads.push({
        id,
        fingerprint: declaration.fingerprint,
        field,
        status: answer ? "resolved" : "pending",
      });
      if (!answer) {
        this.suspendedOn = id;
        throw new PendingRead(id);
      }
      const dependency = this.dependencies.get(declaration.fingerprint) ?? {
        id,
        fingerprint: declaration.fingerprint,
        fields: new Set<string>(),
      };
      dependency.fields.add(field);
      this.dependencies.set(declaration.fingerprint, dependency);
      return answer;
    };
    const mutation = () => {
      throw new NativeRuntimeError(
        'Judgment "' + id + '" is immutable.',
        "IMMUTABLE_ANSWER",
      );
    };
    const handle = new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === Symbol.toPrimitive)
            return () => {
              throw new NativeRuntimeError(
                'Use a semantic field of judgment "' +
                  id +
                  '", not the whole answer.',
                "ANSWER_COERCION",
              );
            };
          return Reflect.get(read(String(key)), key);
        },
        has: (_target, key) => Reflect.has(read(String(key)), key),
        ownKeys: () => Reflect.ownKeys(read("*")),
        getOwnPropertyDescriptor: (_target, key) => {
          const value = read(String(key));
          if (!Object.hasOwn(value, key)) return undefined;
          return {
            configurable: true,
            enumerable: true,
            writable: false,
            value: Reflect.get(value, key),
          };
        },
        set: mutation,
        defineProperty: mutation,
        deleteProperty: mutation,
        setPrototypeOf: mutation,
        preventExtensions: mutation,
      },
    );
    registerHandle(handle, () => read("*"));
    return handle as JudgmentValue<T>;
  }
  knownDependencies(): JudgmentDependency[] {
    return [...this.dependencies.values()].map(
      ({ id, fingerprint, fields }) => ({
        id,
        fingerprint,
        fields: [...fields].sort(),
      }),
    );
  }
}
