import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { ArlopassProvider } from "../provider/arlopass-provider.js";
import { useConnection } from "../hooks/use-connection.js";

function createWrapper(autoConnect = false) {
  const mockTransport = {
    request: vi.fn().mockResolvedValue({ envelope: {} }),
    stream: vi.fn(),
  };
  (window as unknown as Record<string, unknown>).arlopass = mockTransport;
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ArlopassProvider appId="test" autoConnect={autoConnect}>
        {children}
      </ArlopassProvider>
    ),
    mockTransport,
  };
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).arlopass;
});

describe("useConnection", () => {
  it("returns initial disconnected state", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConnection(), { wrapper });
    expect(result.current.state).toBe("disconnected");
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.sessionId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("exposes connect and disconnect functions", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConnection(), { wrapper });
    expect(typeof result.current.connect).toBe("function");
    expect(typeof result.current.disconnect).toBe("function");
  });

  it("throws when used outside ArlopassProvider", () => {
    expect(() => {
      renderHook(() => useConnection());
    }).toThrow("Arlopass hooks must be used within a <ArlopassProvider>");
  });

  it("retry is null when no error", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConnection(), { wrapper });
    expect(result.current.retry).toBeNull();
  });
});
