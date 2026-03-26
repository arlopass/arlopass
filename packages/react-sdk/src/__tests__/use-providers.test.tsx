import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { BYOMProvider } from "../provider/byom-provider.js";
import { useProviders } from "../hooks/use-providers.js";

function createWrapper(autoConnect = false) {
  const mockTransport = {
    request: vi.fn().mockResolvedValue({ envelope: {} }),
    stream: vi.fn(),
  };
  (window as unknown as Record<string, unknown>).byom = mockTransport;
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <BYOMProvider appId="test" autoConnect={autoConnect}>{children}</BYOMProvider>
    ),
    mockTransport,
  };
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).byom;
});

describe("useProviders", () => {
  it("returns initial state", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProviders(), { wrapper });
    expect(result.current.providers).toEqual([]);
    expect(result.current.selectedProvider).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes listProviders, selectProvider function types", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProviders(), { wrapper });
    expect(typeof result.current.listProviders).toBe("function");
    expect(typeof result.current.selectProvider).toBe("function");
  });

  it("retry is null when no error", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useProviders(), { wrapper });
    expect(result.current.retry).toBeNull();
  });

  it("throws when used outside BYOMProvider", () => {
    expect(() => { renderHook(() => useProviders()); }).toThrow("BYOM hooks must be used within a <BYOMProvider>");
  });
});
