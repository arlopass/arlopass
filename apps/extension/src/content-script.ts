const PAGE_TO_CONTENT_CHANNEL = "byom.transport.page-to-content.v1";
const CONTENT_TO_PAGE_CHANNEL = "byom.transport.content-to-page.v1";
const INPAGE_SCRIPT_ID = "byom-extension-inpage-provider-v1";

type TransportBridgeAction = "request" | "request-stream" | "disconnect";

type PageToContentMessage = Readonly<{
  channel: typeof PAGE_TO_CONTENT_CHANNEL;
  source: "byom-inpage-provider";
  requestId: string;
  action: TransportBridgeAction;
  payload: unknown;
}>;

type ContentToPageMessage = Readonly<{
  channel: typeof CONTENT_TO_PAGE_CHANNEL;
  source: "byom-content-script";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPageBridgeMessage(message: unknown): message is PageToContentMessage {
  return (
    isRecord(message) &&
    message["channel"] === PAGE_TO_CONTENT_CHANNEL &&
    message["source"] === "byom-inpage-provider" &&
    typeof message["requestId"] === "string" &&
    (message["action"] === "request" ||
      message["action"] === "request-stream" ||
      message["action"] === "disconnect")
  );
}

function postResponseToPage(message: ContentToPageMessage): void {
  window.postMessage(message, "*");
}

function postError(
  requestId: string,
  message: string,
  extra: Partial<NonNullable<ContentToPageMessage["error"]>> = {},
): void {
  postResponseToPage({
    channel: CONTENT_TO_PAGE_CHANNEL,
    source: "byom-content-script",
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

function relayToBackground(message: PageToContentMessage): void {
  const requestId = message.requestId;

  if (message.action === "request" || message.action === "request-stream") {
    if (!isRecord(message.payload) || !isRecord(message.payload["envelope"])) {
      postError(
        requestId,
        "Invalid transport request payload from page context.",
        {
          reasonCode: "request.invalid",
          machineCode: "BYOM_PROTOCOL_INVALID_ENVELOPE",
          retryable: false,
        },
      );
      return;
    }

    const envelope = {
      ...message.payload["envelope"],
      origin: window.location.origin,
    };
    const requestPayload = {
      ...message.payload,
      envelope,
    };

    chrome.runtime.sendMessage(
      {
        channel: "byom.transport",
        action: message.action,
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
              machineCode: "BYOM_TRANSIENT_NETWORK",
              retryable: true,
            },
          );
          return;
        }

        if (!isRecord(response) || typeof response["ok"] !== "boolean") {
          postError(requestId, "Extension bridge returned an unexpected response.", {
            reasonCode: "transport.transient_failure",
            machineCode: "BYOM_TRANSIENT_NETWORK",
            retryable: true,
          });
          return;
        }

        if (response["ok"] === true) {
          postResponseToPage({
            channel: CONTENT_TO_PAGE_CHANNEL,
            source: "byom-content-script",
            requestId,
            ok: true,
            ...(isRecord(response["envelope"]) ? { envelope: response["envelope"] } : {}),
            ...(Array.isArray(response["envelopes"]) ? { envelopes: response["envelopes"] } : {}),
          });
          return;
        }

        const error = isRecord(response["error"]) ? response["error"] : {};
        postResponseToPage({
          channel: CONTENT_TO_PAGE_CHANNEL,
          source: "byom-content-script",
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
            ...(isRecord(error["details"])
              ? { details: error["details"] }
              : {}),
          },
        });
      },
    );
    return;
  }

  const sessionId = extractDisconnectSessionId(message.payload);
  chrome.runtime.sendMessage(
    {
      channel: "byom.transport",
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
            machineCode: "BYOM_TRANSIENT_NETWORK",
            retryable: true,
          },
        );
        return;
      }

      if (!isRecord(response) || typeof response["ok"] !== "boolean") {
        postError(requestId, "Extension bridge returned an unexpected response.", {
          reasonCode: "transport.transient_failure",
          machineCode: "BYOM_TRANSIENT_NETWORK",
          retryable: true,
        });
        return;
      }

      if (response["ok"] === true) {
        postResponseToPage({
          channel: CONTENT_TO_PAGE_CHANNEL,
          source: "byom-content-script",
          requestId,
          ok: true,
        });
        return;
      }

      const error = isRecord(response["error"]) ? response["error"] : {};
      postResponseToPage({
        channel: CONTENT_TO_PAGE_CHANNEL,
        source: "byom-content-script",
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
  script.src = chrome.runtime.getURL("dist/inpage-provider.js");
  script.async = false;

  script.addEventListener("load", () => {
    script.remove();
  });
  script.addEventListener("error", () => {
    postError(
      "byom.inject",
      "Failed to inject BYOM provider script into page context.",
      {
        reasonCode: "provider.unavailable",
        machineCode: "BYOM_PROVIDER_UNAVAILABLE",
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
