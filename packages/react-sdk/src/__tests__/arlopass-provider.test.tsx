import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useContext } from "react";
import { ArlopassProvider } from "../provider/arlopass-provider.js";
import { ArlopassContext } from "../provider/arlopass-context.js";

function ContextReader() {
  const ctx = useContext(ArlopassContext);
  if (ctx === null) return <div data-testid="no-ctx">no context</div>;
  return <div data-testid="ctx-state">{ctx.store.getSnapshot().state}</div>;
}

describe("ArlopassProvider", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).arlopass;
  });

  it("provides context to children", () => {
    const mockTransport = {
      request: vi.fn().mockResolvedValue({ envelope: {} }),
      stream: vi.fn(),
    };
    (window as unknown as Record<string, unknown>).arlopass = mockTransport;
    render(
      <ArlopassProvider appId="test-app" autoConnect={false}>
        <ContextReader />
      </ArlopassProvider>,
    );
    expect(screen.getByTestId("ctx-state").textContent).toBe("disconnected");
  });

  it("sets transportAvailable=false when window.arlopass missing", () => {
    function TransportCheck() {
      const ctx = useContext(ArlopassContext);
      return (
        <div data-testid="transport">{String(ctx?.transportAvailable)}</div>
      );
    }
    render(
      <ArlopassProvider appId="test-app" autoConnect={false}>
        <TransportCheck />
      </ArlopassProvider>,
    );
    expect(screen.getByTestId("transport").textContent).toBe("false");
  });
});
