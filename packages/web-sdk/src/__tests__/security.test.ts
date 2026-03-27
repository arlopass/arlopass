import { PROTOCOL_MACHINE_CODES } from "@arlopass/protocol";
import { describe, expect, it } from "vitest";

import type {
  ChatSendPayload,
  ChatSendResponsePayload,
  TransportRequest,
  TransportResponse,
} from "../types.js";
import {
  MockTransport,
  connectAndSelectProvider,
  createDefaultRequestHandler,
  createResponseEnvelope,
  setupConnectedClient,
} from "./test-helpers.js";

function invalidEnvelopeResponse(
  request: TransportRequest<unknown>,
  overrides: Record<string, unknown>,
): TransportResponse<unknown> {
  const envelope = {
    ...request.envelope,
    ...overrides,
  };

  return {
    envelope: envelope as unknown as TransportResponse<unknown>["envelope"],
  };
}

describe("ArlopassClient security regressions", () => {
  it("rejects responses missing required correlationId", async () => {
    const transport = new MockTransport();
    transport.requestHandler = async (request) => {
      if (request.envelope.capability === "chat.completions") {
        const response = invalidEnvelopeResponse(
          request,
          {
            correlationId: undefined,
            payload: {
              message: {
                role: "assistant",
                content: "unsafe",
              },
            },
          },
        );
        delete (response.envelope as Record<string, unknown>).correlationId;
        return response;
      }

      return createDefaultRequestHandler()(request);
    };
    transport.streamHandler = async () => {
      throw new Error("stream not expected in this test");
    };

    const client = setupConnectedClient(transport);
    await connectAndSelectProvider(client);

    await expect(
      client.chat.send({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toMatchObject({
      machineCode: PROTOCOL_MACHINE_CODES.MISSING_REQUIRED_FIELD,
      reasonCode: "request.invalid",
    });
  });

  it("rejects unsupported major protocol versions deterministically", async () => {
    const transport = new MockTransport();
    transport.requestHandler = async (request) => {
      if (request.envelope.capability === "chat.completions") {
        const envelope = createResponseEnvelope<
          ChatSendPayload,
          ChatSendResponsePayload
        >(
          request as TransportRequest<ChatSendPayload>,
          {
            message: {
              role: "assistant",
              content: "unsupported",
            },
          },
          {
            protocolVersion: "2.0.0",
          },
        );
        return { envelope } as TransportResponse<unknown>;
      }

      return createDefaultRequestHandler()(request);
    };
    transport.streamHandler = async () => {
      throw new Error("stream not expected in this test");
    };

    const client = setupConnectedClient(transport);
    await connectAndSelectProvider(client);

    await expect(
      client.chat.send({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toMatchObject({
      machineCode: PROTOCOL_MACHINE_CODES.UNSUPPORTED_PROTOCOL_VERSION,
      reasonCode: "protocol.unsupported_version",
    });
  });

  it("fails fast when unknown top-level fields are present", async () => {
    const transport = new MockTransport();
    transport.requestHandler = async (request) => {
      if (request.envelope.capability === "chat.completions") {
        return invalidEnvelopeResponse(
          request,
          {
            unexpectedField: "unexpected",
            payload: {
              message: {
                role: "assistant",
                content: "unsafe",
              },
            },
          },
        );
      }

      return createDefaultRequestHandler()(request);
    };
    transport.streamHandler = async () => {
      throw new Error("stream not expected in this test");
    };

    const client = setupConnectedClient(transport);
    await connectAndSelectProvider(client);

    await expect(
      client.chat.send({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toMatchObject({
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "protocol.invalid_envelope",
    });
  });

  it("rejects replay-prone metadata in responses", async () => {
    const transport = new MockTransport();
    transport.requestHandler = async (request) => {
      if (request.envelope.capability === "chat.completions") {
        const now = new Date(request.envelope.issuedAt);
        return invalidEnvelopeResponse(
          request,
          {
            issuedAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
            nonce: "short",
            payload: {
              message: {
                role: "assistant",
                content: "unsafe",
              },
            },
          },
        );
      }

      return createDefaultRequestHandler()(request);
    };
    transport.streamHandler = async () => {
      throw new Error("stream not expected in this test");
    };

    const client = setupConnectedClient(transport);
    await connectAndSelectProvider(client);

    await expect(
      client.chat.send({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toMatchObject({
      machineCode: PROTOCOL_MACHINE_CODES.REPLAY_PRONE_METADATA,
      reasonCode: "request.replay_prone",
    });
  });
});
