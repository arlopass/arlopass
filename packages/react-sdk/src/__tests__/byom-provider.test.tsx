import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useContext } from "react";
import { BYOMProvider } from "../provider/byom-provider.js";
import { BYOMContext } from "../provider/byom-context.js";

function ContextReader() {
  const ctx = useContext(BYOMContext);
  if (ctx === null) return <div data-testid="no-ctx">no context</div>;
  return <div data-testid="ctx-state">{ctx.store.getSnapshot().state}</div>;
}

describe("BYOMProvider", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).byom;
  });

  it("provides context to children", () => {
    const mockTransport = {
      request: vi.fn().mockResolvedValue({ envelope: {} }),
      stream: vi.fn(),
    };
    (window as unknown as Record<string, unknown>).byom = mockTransport;
    render(<BYOMProvider appId="test-app" autoConnect={false}><ContextReader /></BYOMProvider>);
    expect(screen.getByTestId("ctx-state").textContent).toBe("disconnected");
  });

  it("sets transportAvailable=false when window.byom missing", () => {
    function TransportCheck() {
      const ctx = useContext(BYOMContext);
      return <div data-testid="transport">{String(ctx?.transportAvailable)}</div>;
    }
    render(<BYOMProvider appId="test-app" autoConnect={false}><TransportCheck /></BYOMProvider>);
    expect(screen.getByTestId("transport").textContent).toBe("false");
  });
});
