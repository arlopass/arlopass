import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { type ReactNode } from "react";
import { ArlopassProvider } from "../provider/arlopass-provider.js";
import { useChat } from "../hooks/use-chat.js";

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

describe("useChat", () => {
  it("returns initial state", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.streamingContent).toBe("");
    expect(result.current.streamingMessageId).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes send, stream, stop, clearMessages, subscribe function types", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(typeof result.current.send).toBe("function");
    expect(typeof result.current.stream).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(typeof result.current.clearMessages).toBe("function");
    expect(typeof result.current.subscribe).toBe("function");
  });

  it("throws when used outside ArlopassProvider", () => {
    expect(() => {
      renderHook(() => useChat());
    }).toThrow("Arlopass hooks must be used within a <ArlopassProvider>");
  });

  it("accepts initialMessages", () => {
    const { wrapper } = createWrapper();
    const initialMessages = [
      {
        id: "1",
        role: "user" as const,
        content: "hello",
        status: "complete" as const,
        pinned: false,
      },
    ];
    const { result } = renderHook(() => useChat({ initialMessages }), {
      wrapper,
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]!.content).toBe("hello");
  });

  it("clearMessages resets state", () => {
    const { wrapper } = createWrapper();
    const initialMessages = [
      {
        id: "1",
        role: "user" as const,
        content: "hello",
        status: "complete" as const,
        pinned: false,
      },
    ];
    const { result } = renderHook(() => useChat({ initialMessages }), {
      wrapper,
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.streamingContent).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("subscribe returns an unsubscribe function", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChat(), { wrapper });
    const handler = vi.fn();
    const unsub = result.current.subscribe("response", handler);
    expect(typeof unsub).toBe("function");
  });

  it("retry is null when no error", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.retry).toBeNull();
  });
});
