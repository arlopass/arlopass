const PAGE_TO_CONTENT_CHANNEL = "arlopass.transport.page-to-content.v1";
const CONTENT_TO_PAGE_CHANNEL = "arlopass.transport.content-to-page.v1";
const TRANSPORT_STREAM_CHANNEL = "arlopass.transport.stream";
const TRANSPORT_STREAM_PORT_NAME = "arlopass.transport.stream.v1";
const INPAGE_SCRIPT_ID = "arlopass-extension-inpage-provider-v1";

type TransportBridgeAction =
  | "request"
  | "request-stream"
  | "cancel-stream"
  | "disconnect";

type PageToContentMessage = Readonly<{
  channel: typeof PAGE_TO_CONTENT_CHANNEL;
  source: "arlopass-inpage-provider";
  requestId: string;
  action: TransportBridgeAction;
  payload: unknown;
}>;

type TransportStreamEventType = "start" | "chunk" | "done" | "error" | "cancelled";

type ContentToPageMessage = Readonly<{
  channel: typeof CONTENT_TO_PAGE_CHANNEL;
  source: "arlopass-content-script";
  requestId: string;
  ok: boolean;
  envelope?: unknown;
  envelopes?: readonly unknown[];
  error?: Readonly<{
    message: string;
    machineCode?: string;
    reasonCode?: string;
    retryable?: boolean;
    correlationId?: string;
    details?: Readonly<Record<string, unknown>>;
  }>;
}>;

type ContentToPageStreamMessage = Readonly<{
  channel: typeof CONTENT_TO_PAGE_CHANNEL;
  source: "arlopass-content-script";
  requestId: string;
  stream: true;
  event: TransportStreamEventType;
  envelope?: unknown;
  error?: Readonly<{
    message: string;
    machineCode?: string;
    reasonCode?: string;
    retryable?: boolean;
    correlationId?: string;
    details?: Readonly<Record<string, unknown>>;
  }>;
}>;

type ContentToPageBridgeMessage = ContentToPageMessage | ContentToPageStreamMessage;

type RuntimeStreamPortMessage = Readonly<{
  channel: typeof TRANSPORT_STREAM_CHANNEL;
  requestId: string;
  event: TransportStreamEventType;
  envelope?: unknown;
  error?: unknown;
}>;

type RuntimePortLike = Readonly<{
  name: string;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: Readonly<{
    addListener(listener: (message: unknown) => void): void;
  }>;
  onDisconnect: Readonly<{
    addListener(listener: () => void): void;
  }>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPageBridgeMessage(message: unknown): message is PageToContentMessage {
  return (
    isRecord(message) &&
    message["channel"] === PAGE_TO_CONTENT_CHANNEL &&
    message["source"] === "arlopass-inpage-provider" &&
    typeof message["requestId"] === "string" &&
    (message["action"] === "request" ||
      message["action"] === "request-stream" ||
      message["action"] === "cancel-stream" ||
      message["action"] === "disconnect")
  );
}

function postResponseToPage(message: ContentToPageBridgeMessage): void {
  window.postMessage(message, "*");
}

function postError(
  requestId: string,
  message: string,
  extra: Partial<NonNullable<ContentToPageMessage["error"]>> = {},
): void {
  postResponseToPage({
    channel: CONTENT_TO_PAGE_CHANNEL,
    source: "arlopass-content-script",
    requestId,
    ok: false,
    error: {
      message,
      ...(extra.machineCode !== undefined ? { machineCode: extra.machineCode } : {}),
      ...(extra.reasonCode !== undefined ? { reasonCode: extra.reasonCode } : {}),
      ...(extra.retryable !== undefined ? { retryable: extra.retryable } : {}),
      ...(extra.correlationId !== undefined
        ? { correlationId: extra.correlationId }
        : {}),
      ...(extra.details !== undefined ? { details: extra.details } : {}),
    },
  });
}

function extractDisconnectSessionId(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  return typeof payload["sessionId"] === "string" ? payload["sessionId"] : undefined;
}

function toRuntimeErrorPayload(
  error: unknown,
): NonNullable<ContentToPageMessage["error"]> {
  const safeError = isRecord(error) ? error : {};
  return {
    message:
      typeof safeError["message"] === "string"
        ? safeError["message"]
        : "Extension bridge reported an error.",
    ...(typeof safeError["machineCode"] === "string"
      ? { machineCode: safeError["machineCode"] }
      : {}),
    ...(typeof safeError["reasonCode"] === "string"
      ? { reasonCode: safeError["reasonCode"] }
      : {}),
    ...(typeof safeError["retryable"] === "boolean"
      ? { retryable: safeError["retryable"] }
      : {}),
    ...(typeof safeError["correlationId"] === "string"
      ? { correlationId: safeError["correlationId"] }
      : {}),
    ...(isRecord(safeError["details"]) ? { details: safeError["details"] } : {}),
  };
}

function isRuntimeStreamPortMessage(value: unknown): value is RuntimeStreamPortMessage {
  return (
    isRecord(value) &&
    value["channel"] === TRANSPORT_STREAM_CHANNEL &&
    typeof value["requestId"] === "string" &&
    (value["event"] === "start" ||
      value["event"] === "chunk" ||
      value["event"] === "done" ||
      value["event"] === "error" ||
      value["event"] === "cancelled")
  );
}

function createOriginBoundRequestPayload(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload) || !isRecord(payload["envelope"])) {
    return null;
  }

  const envelope = {
    ...payload["envelope"],
    origin: window.location.origin,
  };
  return {
    ...payload,
    envelope,
  };
}

const activeStreamPorts = new Map<string, RuntimePortLike>();

function relayBufferedStreamToBackground(
  requestId: string,
  requestPayload: Record<string, unknown>,
): void {
  chrome.runtime.sendMessage(
    {
      channel: "arlopass.transport",
      action: "request-stream",
      request: requestPayload,
    },
    (response: unknown) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError !== undefined) {
        postError(
          requestId,
          runtimeError.message ?? "Extension bridge stream request failed.",
          {
            reasonCode: "transport.transient_failure",
            machineCode: "ARLOPASS_TRANSIENT_NETWORK",
            retryable: true,
          },
        );
        return;
      }

      if (!isRecord(response) || typeof response["ok"] !== "boolean") {
        postError(requestId, "Extension bridge returned an unexpected response.", {
          reasonCode: "transport.transient_failure",
          machineCode: "ARLOPASS_TRANSIENT_NETWORK",
          retryable: true,
        });
        return;
      }

      if (response["ok"] === true) {
        postResponseToPage({
          channel: CONTENT_TO_PAGE_CHANNEL,
          source: "arlopass-content-script",
          requestId,
          ok: true,
          ...(Array.isArray(response["envelopes"]) ? { envelopes: response["envelopes"] } : {}),
        });
        return;
      }

      postResponseToPage({
        channel: CONTENT_TO_PAGE_CHANNEL,
        source: "arlopass-content-script",
        requestId,
        ok: false,
        error: toRuntimeErrorPayload(response["error"]),
      });
    },
  );
}

function relayLiveStreamToBackground(
  requestId: string,
  requestPayload: Record<string, unknown>,
): void {
  if (activeStreamPorts.has(requestId)) {
    postResponseToPage({
      channel: CONTENT_TO_PAGE_CHANNEL,
      source: "arlopass-content-script",
      requestId,
      stream: true,
      event: "error",
      error: {
        message: "Stream requestId is already active.",
        reasonCode: "request.invalid",
        machineCode: "ARLOPASS_PROTOCOL_INVALID_ENVELOPE",
        retryable: false,
      },
    });
    return;
  }

  const runtime = chrome.runtime as {
    connect?: (connectInfo?: { name: string }) => unknown;
  };
  if (typeof runtime.connect !== "function") {
    relayBufferedStreamToBackground(requestId, requestPayload);
    return;
  }

  let rawPort: unknown;
  try {
    rawPort = runtime.connect({ name: TRANSPORT_STREAM_PORT_NAME });
  } catch {
    relayBufferedStreamToBackground(requestId, requestPayload);
    return;
  }

  if (!isRecord(rawPort)) {
    relayBufferedStreamToBackground(requestId, requestPayload);
    return;
  }

  const port = rawPort as RuntimePortLike;
  let terminal = false;

  const cleanup = (): void => {
    activeStreamPorts.delete(requestId);
    try {
      port.disconnect();
    } catch {
      // Best effort cleanup only.
    }
  };

  const emitStreamError = (
    message: string,
    extra: Partial<NonNullable<ContentToPageMessage["error"]>> = {},
  ): void => {
    postResponseToPage({
      channel: CONTENT_TO_PAGE_CHANNEL,
      source: "arlopass-content-script",
      requestId,
      stream: true,
      event: "error",
      error: {
        message,
        ...(extra.machineCode !== undefined ? { machineCode: extra.machineCode } : {}),
        ...(extra.reasonCode !== undefined ? { reasonCode: extra.reasonCode } : {}),
        ...(extra.retryable !== undefined ? { retryable: extra.retryable } : {}),
        ...(extra.correlationId !== undefined
          ? { correlationId: extra.correlationId }
          : {}),
        ...(extra.details !== undefined ? { details: extra.details } : {}),
      },
    });
  };

  port.onMessage.addListener((incoming: unknown) => {
    if (!isRuntimeStreamPortMessage(incoming) || incoming.requestId !== requestId) {
      if (!terminal) {
        terminal = true;
        emitStreamError("Malformed stream event received from extension runtime.", {
          reasonCode: "request.invalid",
          machineCode: "ARLOPASS_PROTOCOL_INVALID_ENVELOPE",
          retryable: false,
        });
        cleanup();
      }
      return;
    }

    if (incoming.event === "error") {
      terminal = true;
      postResponseToPage({
        channel: CONTENT_TO_PAGE_CHANNEL,
        source: "arlopass-content-script",
        requestId,
        stream: true,
        event: "error",
        error: toRuntimeErrorPayload(incoming.error),
      });
      cleanup();
      return;
    }

    if (incoming.event === "chunk" || incoming.event === "done") {
      if (!isRecord(incoming.envelope)) {
        terminal = true;
        emitStreamError("Malformed stream envelope received from extension runtime.", {
          reasonCode: "request.invalid",
          machineCode: "ARLOPASS_PROTOCOL_INVALID_ENVELOPE",
          retryable: false,
        });
        cleanup();
        return;
      }
    }

    postResponseToPage({
      channel: CONTENT_TO_PAGE_CHANNEL,
      source: "arlopass-content-script",
      requestId,
      stream: true,
      event: incoming.event,
      ...(incoming.envelope !== undefined ? { envelope: incoming.envelope } : {}),
    });

    if (incoming.event === "done" || incoming.event === "cancelled") {
      terminal = true;
      cleanup();
    }
  });

  port.onDisconnect.addListener(() => {
    if (terminal) {
      return;
    }
    terminal = true;
    const runtimeError = chrome.runtime.lastError;
    emitStreamError(runtimeError?.message ?? "Extension stream bridge disconnected.", {
      reasonCode: "transport.transient_failure",
      machineCode: "ARLOPASS_TRANSIENT_NETWORK",
      retryable: true,
    });
    cleanup();
  });

  activeStreamPorts.set(requestId, port);
  try {
    port.postMessage({
      channel: TRANSPORT_STREAM_CHANNEL,
      action: "start",
      requestId,
      request: requestPayload,
    });
  } catch {
    activeStreamPorts.delete(requestId);
    try {
      port.disconnect();
    } catch {
      // ignored
    }
    relayBufferedStreamToBackground(requestId, requestPayload);
  }
}

function relayToBackground(message: PageToContentMessage): void {
  const requestId = message.requestId;

  if (message.action === "request") {
    const requestPayload = createOriginBoundRequestPayload(message.payload);
    if (requestPayload === null) {
      postError(
        requestId,
        "Invalid transport request payload from page context.",
        {
          reasonCode: "request.invalid",
          machineCode: "ARLOPASS_PROTOCOL_INVALID_ENVELOPE",
          retryable: false,
        },
      );
      return;
    }

    chrome.runtime.sendMessage(
      {
        channel: "arlopass.transport",
        action: "request",
        request: requestPayload,
      },
      (response: unknown) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError !== undefined) {
          postError(
            requestId,
            runtimeError.message ?? "Extension bridge request failed.",
            {
              reasonCode: "transport.transient_failure",
              machineCode: "ARLOPASS_TRANSIENT_NETWORK",
              retryable: true,
            },
          );
          return;
        }

        if (!isRecord(response) || typeof response["ok"] !== "boolean") {
          postError(requestId, "Extension bridge returned an unexpected response.", {
            reasonCode: "transport.transient_failure",
            machineCode: "ARLOPASS_TRANSIENT_NETWORK",
            retryable: true,
          });
          return;
        }

        if (response["ok"] === true) {
          postResponseToPage({
            channel: CONTENT_TO_PAGE_CHANNEL,
            source: "arlopass-content-script",
            requestId,
            ok: true,
            ...(isRecord(response["envelope"]) ? { envelope: response["envelope"] } : {}),
            ...(Array.isArray(response["envelopes"]) ? { envelopes: response["envelopes"] } : {}),
          });
          return;
        }

        postResponseToPage({
          channel: CONTENT_TO_PAGE_CHANNEL,
          source: "arlopass-content-script",
          requestId,
          ok: false,
          error: toRuntimeErrorPayload(response["error"]),
        });
      },
    );
    return;
  }

  if (message.action === "request-stream") {
    const requestPayload = createOriginBoundRequestPayload(message.payload);
    if (requestPayload === null) {
      postError(
        requestId,
        "Invalid transport stream payload from page context.",
        {
          reasonCode: "request.invalid",
          machineCode: "ARLOPASS_PROTOCOL_INVALID_ENVELOPE",
          retryable: false,
        },
      );
      return;
    }

    relayLiveStreamToBackground(requestId, requestPayload);
    return;
  }

  if (message.action === "cancel-stream") {
    const port = activeStreamPorts.get(requestId);
    if (port === undefined) {
      postResponseToPage({
        channel: CONTENT_TO_PAGE_CHANNEL,
        source: "arlopass-content-script",
        requestId,
        stream: true,
        event: "cancelled",
      });
      return;
    }

    try {
      port.postMessage({
        channel: TRANSPORT_STREAM_CHANNEL,
        action: "cancel",
        requestId,
      });
    } catch {
      postResponseToPage({
        channel: CONTENT_TO_PAGE_CHANNEL,
        source: "arlopass-content-script",
        requestId,
        stream: true,
        event: "error",
        error: {
          message: "Failed to propagate stream cancellation to extension runtime.",
          reasonCode: "transport.transient_failure",
          machineCode: "ARLOPASS_TRANSIENT_NETWORK",
          retryable: true,
        },
      });
      activeStreamPorts.delete(requestId);
      try {
        port.disconnect();
      } catch {
        // ignored
      }
    }
    return;
  }

  const sessionId = extractDisconnectSessionId(message.payload);
  chrome.runtime.sendMessage(
    {
      channel: "arlopass.transport",
      action: "disconnect",
      ...(sessionId !== undefined ? { sessionId } : {}),
    },
    (response: unknown) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError !== undefined) {
        postError(
          requestId,
          runtimeError.message ?? "Extension bridge disconnect failed.",
          {
            reasonCode: "transport.transient_failure",
            machineCode: "ARLOPASS_TRANSIENT_NETWORK",
            retryable: true,
          },
        );
        return;
      }

      if (!isRecord(response) || typeof response["ok"] !== "boolean") {
        postError(requestId, "Extension bridge returned an unexpected response.", {
          reasonCode: "transport.transient_failure",
          machineCode: "ARLOPASS_TRANSIENT_NETWORK",
          retryable: true,
        });
        return;
      }

      if (response["ok"] === true) {
        postResponseToPage({
          channel: CONTENT_TO_PAGE_CHANNEL,
          source: "arlopass-content-script",
          requestId,
          ok: true,
        });
        return;
      }

      const error = isRecord(response["error"]) ? response["error"] : {};
      postResponseToPage({
        channel: CONTENT_TO_PAGE_CHANNEL,
        source: "arlopass-content-script",
        requestId,
        ok: false,
        error: {
          message:
            typeof error["message"] === "string"
              ? error["message"]
              : "Extension bridge reported an error.",
          ...(typeof error["machineCode"] === "string"
            ? { machineCode: error["machineCode"] }
            : {}),
          ...(typeof error["reasonCode"] === "string"
            ? { reasonCode: error["reasonCode"] }
            : {}),
          ...(typeof error["retryable"] === "boolean"
            ? { retryable: error["retryable"] }
            : {}),
          ...(typeof error["correlationId"] === "string"
            ? { correlationId: error["correlationId"] }
            : {}),
          ...(isRecord(error["details"]) ? { details: error["details"] } : {}),
        },
      });
    },
  );
}

function registerPageBridgeListener(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const message = event.data;
    if (!isPageBridgeMessage(message)) {
      return;
    }

    relayToBackground(message);
  });
}

function injectInpageProviderScript(): void {
  const existing = document.getElementById(INPAGE_SCRIPT_ID);
  if (existing !== null) {
    return;
  }

  const script = document.createElement("script");
  script.id = INPAGE_SCRIPT_ID;
  script.type = "text/javascript";
  script.src = chrome.runtime.getURL(
    typeof __INPAGE_SCRIPT_PATH__ !== "undefined"
      ? __INPAGE_SCRIPT_PATH__
      : "dist/inpage-provider.js",
  );
  script.async = false;

  script.addEventListener("load", () => {
    script.remove();
  });
  script.addEventListener("error", () => {
    postError(
      "arlopass.inject",
      "Failed to inject Arlopass provider script into page context.",
      {
        reasonCode: "provider.unavailable",
        machineCode: "ARLOPASS_PROVIDER_UNAVAILABLE",
        retryable: false,
      },
    );
    script.remove();
  });

  const parent = document.documentElement ?? document.head;
  if (parent === null) {
    return;
  }

  parent.appendChild(script);
}

registerPageBridgeListener();
injectInpageProviderScript();
