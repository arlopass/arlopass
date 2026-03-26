import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PAGE_TO_CONTENT_CHANNEL = "byom.transport.page-to-content.v1";
const CONTENT_TO_PAGE_CHANNEL = "byom.transport.content-to-page.v1";
const TRANSPORT_STREAM_PORT_NAME = "byom.transport.stream.v1";

type PageMessageListener = (event: Readonly<{ source: unknown; data: unknown }>) => void;

type ContentScriptHarness = Readonly<{
  connect: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  port: Readonly<{
    postMessage: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onMessage: Readonly<{ addListener: ReturnType<typeof vi.fn> }>;
    onDisconnect: Readonly<{ addListener: ReturnType<typeof vi.fn> }>;
  }>;
  windowPostMessage: ReturnType<typeof vi.fn>;
  emitPageMessage: (message: unknown) => void;
}>;

async function loadContentScriptHarness(): Promise<ContentScriptHarness> {
  let pageMessageListener: PageMessageListener | undefined;

  const port = {
    name: TRANSPORT_STREAM_PORT_NAME,
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
    onDisconnect: {
      addListener: vi.fn(),
    },
  };

  const connect = vi.fn(() => port);
  const sendMessage = vi.fn();
  const getURL = vi.fn((path: string) => `chrome-extension://byom-extension/${path}`);
  const runtime = {
    connect,
    sendMessage,
    getURL,
    lastError: undefined as { message?: string } | undefined,
  };

  const windowPostMessage = vi.fn();
  const windowStub = {
    location: { origin: "https://app.example.com" },
    addEventListener: vi.fn((eventName: string, listener: PageMessageListener) => {
      if (eventName === "message") {
        pageMessageListener = listener;
      }
    }),
    postMessage: windowPostMessage,
  };

  const scriptElement = {
    id: "",
    type: "",
    src: "",
    async: false,
    addEventListener: vi.fn(),
    remove: vi.fn(),
  };
  const appendChild = vi.fn();
  const documentStub = {
    getElementById: vi.fn(() => null),
    createElement: vi.fn(() => scriptElement),
    documentElement: { appendChild },
    head: null,
  };

  vi.stubGlobal("chrome", { runtime });
  vi.stubGlobal("window", windowStub as unknown as Window);
  vi.stubGlobal("document", documentStub as unknown as Document);

  await import("../content-script.js");

  return {
    connect,
    sendMessage,
    port,
    windowPostMessage,
    emitPageMessage(message: unknown): void {
      pageMessageListener?.({
        source: windowStub,
        data: message,
      });
    },
  };
}

describe("content script stream relay hardening", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects duplicate active stream requestIds instead of creating orphan stream ports", async () => {
    const harness = await loadContentScriptHarness();

    const streamRequest = {
      channel: PAGE_TO_CONTENT_CHANNEL,
      source: "byom-inpage-provider",
      requestId: "req.stream.duplicate.001",
      action: "request-stream",
      payload: {
        envelope: {
          capability: "chat.stream",
          requestId: "req.stream.duplicate.001",
        },
      },
    };

    harness.emitPageMessage(streamRequest);
    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.port.postMessage).toHaveBeenCalledTimes(1);
    expect(harness.port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "byom.transport.stream",
        action: "start",
        requestId: "req.stream.duplicate.001",
      }),
    );

    harness.emitPageMessage(streamRequest);

    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.port.postMessage).toHaveBeenCalledTimes(1);
    expect(harness.windowPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: CONTENT_TO_PAGE_CHANNEL,
        source: "byom-content-script",
        requestId: "req.stream.duplicate.001",
        stream: true,
        event: "error",
        error: expect.objectContaining({
          reasonCode: "request.invalid",
          machineCode: "BYOM_PROTOCOL_INVALID_ENVELOPE",
          retryable: false,
        }),
      }),
      "*",
    );
  });

  it("uses bound runtime.connect for live stream relay without buffered fallback", async () => {
    const harness = await loadContentScriptHarness();
    const runtime = (
      globalThis as unknown as {
        chrome: { runtime: unknown };
      }
    ).chrome.runtime;

    harness.connect.mockImplementation(function (this: unknown) {
      if (this !== runtime) {
        throw new TypeError("Illegal invocation");
      }
      return harness.port;
    });

    harness.emitPageMessage({
      channel: PAGE_TO_CONTENT_CHANNEL,
      source: "byom-inpage-provider",
      requestId: "req.stream.bound.connect.001",
      action: "request-stream",
      payload: {
        envelope: {
          capability: "chat.stream",
          requestId: "req.stream.bound.connect.001",
        },
      },
    });

    expect(harness.sendMessage).not.toHaveBeenCalled();
    expect(harness.port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "byom.transport.stream",
        action: "start",
        requestId: "req.stream.bound.connect.001",
      }),
    );
  });
});
