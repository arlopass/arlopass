import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { type ReactNode } from "react";
import { BYOMProvider } from "../provider/byom-provider.js";
import { useConversation } from "../hooks/use-conversation.js";

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

describe("useConversation", () => {
  it("returns initial state", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversation(), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.streamingContent).toBe("");
    expect(result.current.streamingMessageId).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes send, stream, stop, clearMessages, pinMessage, submitToolResult, subscribe", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversation(), { wrapper });
    expect(typeof result.current.send).toBe("function");
    expect(typeof result.current.stream).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(typeof result.current.clearMessages).toBe("function");
    expect(typeof result.current.pinMessage).toBe("function");
    expect(typeof result.current.submitToolResult).toBe("function");
    expect(typeof result.current.subscribe).toBe("function");
  });

  it("throws when used outside BYOMProvider", () => {
    expect(() => { renderHook(() => useConversation()); }).toThrow("BYOM hooks must be used within a <BYOMProvider>");
  });

  it("accepts initialMessages", () => {
    const { wrapper } = createWrapper();
    const initialMessages = [
      { id: "1", role: "user" as const, content: "hello", status: "complete" as const, pinned: false },
    ];
    const { result } = renderHook(() => useConversation({ initialMessages }), { wrapper });
    expect(result.current.messages).toHaveLength(1);
  });

  it("tokenCount starts at 0", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversation(), { wrapper });
    expect(result.current.tokenCount).toBe(0);
  });

  it("contextWindow starts empty", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversation(), { wrapper });
    expect(result.current.contextWindow).toEqual([]);
  });

  it("clearMessages resets all state", () => {
    const { wrapper } = createWrapper();
    const initialMessages = [
      { id: "1", role: "user" as const, content: "hello", status: "complete" as const, pinned: false },
    ];
    const { result } = renderHook(() => useConversation({ initialMessages }), { wrapper });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.tokenCount).toBe(0);
    expect(result.current.contextWindow).toEqual([]);
  });

  it("retry is null when no error", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConversation(), { wrapper });
    expect(result.current.retry).toBeNull();
  });
});
