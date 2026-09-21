/** Transport-local errors; no workflow engine or policy dependency. */
export class RuntimeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function abort(signal: AbortSignal): void {
  if (signal.aborted)
    throw new RuntimeError("cancelled", "Operation cancelled");
}
