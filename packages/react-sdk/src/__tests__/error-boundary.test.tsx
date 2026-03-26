import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BYOMErrorBoundary } from "../guards/byom-error-boundary.js";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom");
  return <div data-testid="child">ok</div>;
}

describe("BYOMErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <BYOMErrorBoundary fallback={({ error }) => <div>{error.message}</div>}>
        <ThrowingChild shouldThrow={false} />
      </BYOMErrorBoundary>,
    );
    expect(screen.getByTestId("child").textContent).toBe("ok");
  });

  it("renders fallback when child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <BYOMErrorBoundary
        fallback={({ error }) => <div data-testid="fallback">{error.message}</div>}
      >
        <ThrowingChild shouldThrow={true} />
      </BYOMErrorBoundary>,
    );
    expect(screen.getByTestId("fallback").textContent).toBe("boom");
    spy.mockRestore();
  });

  it("calls onError callback when child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <BYOMErrorBoundary
        fallback={({ error }) => <div>{error.message}</div>}
        onError={onError}
      >
        <ThrowingChild shouldThrow={true} />
      </BYOMErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    const callArgs = onError.mock.calls[0]!;
    expect(callArgs[0]).toBeInstanceOf(Error);
    expect((callArgs[0] as Error).message).toBe("boom");
    spy.mockRestore();
  });
});
