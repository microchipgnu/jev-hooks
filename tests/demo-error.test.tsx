// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  DemoErrorNotice,
  useRetrySeconds,
} from "../examples/react/error-notice.js";
import { DemoRateLimitError } from "../examples/react/live-client.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("counts down a rate limit, blocks premature retry, and leaves retry manual at expiry", async () => {
  vi.useFakeTimers();
  const error = new DemoRateLimitError(Date.now() + 8000, "ip-minute");
  const retry = vi.fn();
  function Notice() {
    return (
      <DemoErrorNotice
        error={error}
        seconds={useRetrySeconds(error)}
        onRetry={retry}
      />
    );
  }
  render(<Notice />);
  expect(screen.getByRole("alert").textContent).toContain("per-minute");
  const button = screen.getByRole("button", {
    name: "Try again in 8s",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(retry).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByRole("button", { name: "Try again in 3s" })).toBe(button);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(screen.getByRole("alert").textContent).toContain("Ready to try again");
  expect(button.disabled).toBe(false);
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(retry).toHaveBeenCalledTimes(1);
});
