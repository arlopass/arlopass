import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArlopassErrorBoundary } from "../guards/arlopass-error-boundary.js";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom");
  return <div data-testid="child">ok</div>;
}

describe("ArlopassErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ArlopassErrorBoundary
        fallback={({ error }) => <div>{error.message}</div>}
      >
        <ThrowingChild shouldThrow={false} />
      </ArlopassErrorBoundary>,
    );
    expect(screen.getByTestId("child").textContent).toBe("ok");
  });

  it("renders fallback when child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ArlopassErrorBoundary
        fallback={({ error }) => (
          <div data-testid="fallback">{error.message}</div>
        )}
      >
        <ThrowingChild shouldThrow={true} />
      </ArlopassErrorBoundary>,
    );
    expect(screen.getByTestId("fallback").textContent).toBe("boom");
    spy.mockRestore();
  });

  it("calls onError callback when child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <ArlopassErrorBoundary
        fallback={({ error }) => <div>{error.message}</div>}
        onError={onError}
      >
        <ThrowingChild shouldThrow={true} />
      </ArlopassErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    const callArgs = onError.mock.calls[0]!;
    expect(callArgs[0]).toBeInstanceOf(Error);
    expect((callArgs[0] as Error).message).toBe("boom");
    spy.mockRestore();
  });
});
