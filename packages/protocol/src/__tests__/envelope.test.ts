import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_ENVELOPE_LIFETIME_MS,
  parseEnvelope,
} from "../envelope.js";
import {
  EnvelopeValidationError,
  PROTOCOL_MACHINE_CODES,
} from "../errors.js";

const BASE_TIME = new Date("2026-03-23T12:00:00.000Z");

function createValidEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: "1.0.0",
    requestId: "req.12345",
    correlationId: "corr.12345",
    origin: "https://example.app",
    sessionId: "session.12345",
    capability: "chat.stream",
    providerId: "provider.ollama",
    modelId: "model.llama3",
    issuedAt: "2026-03-23T11:59:30.000Z",
    expiresAt: "2026-03-23T12:00:30.000Z",
    nonce: "AQIDBAUGBwgJCgsMDQ4PEA",
    payload: { messages: [{ role: "user", content: "hello" }] },
    ...overrides,
  };
}

describe("parseEnvelope", () => {
  it("accepts a valid canonical envelope", () => {
    const parsed = parseEnvelope(createValidEnvelope(), {
      now: BASE_TIME,
    });

    expect(parsed).toMatchObject({
      protocolVersion: "1.0.0",
      requestId: "req.12345",
      correlationId: "corr.12345",
      origin: "https://example.app",
      sessionId: "session.12345",
      capability: "chat.stream",
      providerId: "provider.ollama",
      modelId: "model.llama3",
      issuedAt: "2026-03-23T11:59:30.000Z",
      expiresAt: "2026-03-23T12:00:30.000Z",
      nonce: "AQIDBAUGBwgJCgsMDQ4PEA",
    });
  });

  it("rejects missing required fields, including correlationId", () => {
    const invalid: Record<string, unknown> = { ...createValidEnvelope() };
    delete invalid.correlationId;

    expect(() =>
      parseEnvelope(invalid, {
        now: BASE_TIME,
      }),
    ).toThrowError(EnvelopeValidationError);

    try {
      parseEnvelope(invalid, { now: BASE_TIME });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvelopeValidationError);

      if (error instanceof EnvelopeValidationError) {
        expect(error.machineCode).toBe(
          PROTOCOL_MACHINE_CODES.MISSING_REQUIRED_FIELD,
        );
        expect(error.details).toMatchObject({
          field: "correlationId",
        });
      }
    }
  });

  it("rejects expired envelopes", () => {
    expect(() =>
      parseEnvelope(
        createValidEnvelope({
          issuedAt: "2026-03-23T11:50:00.000Z",
          expiresAt: "2026-03-23T11:59:00.000Z",
        }),
        { now: BASE_TIME },
      ),
    ).toThrowError(EnvelopeValidationError);

    try {
      parseEnvelope(
        createValidEnvelope({
          issuedAt: "2026-03-23T11:50:00.000Z",
          expiresAt: "2026-03-23T11:59:00.000Z",
        }),
        { now: BASE_TIME },
      );
    } catch (error) {
      if (error instanceof EnvelopeValidationError) {
        expect(error.machineCode).toBe(
          PROTOCOL_MACHINE_CODES.ENVELOPE_EXPIRED,
        );
      }
    }
  });

  it("rejects replay-prone metadata", () => {
    expect(() =>
      parseEnvelope(
        createValidEnvelope({
          issuedAt: "2026-03-23T11:59:30.000Z",
          expiresAt: new Date(
            BASE_TIME.getTime() + DEFAULT_MAX_ENVELOPE_LIFETIME_MS + 1,
          ).toISOString(),
        }),
        { now: BASE_TIME },
      ),
    ).toThrowError(EnvelopeValidationError);

    expect(() =>
      parseEnvelope(
        createValidEnvelope({
          nonce: "short",
        }),
        { now: BASE_TIME },
      ),
    ).toThrowError(EnvelopeValidationError);
  });

  it("rejects unknown top-level envelope fields by default", () => {
    expect(() =>
      parseEnvelope(
        createValidEnvelope({
          unexpected: "value",
        }),
        { now: BASE_TIME },
      ),
    ).toThrowError(EnvelopeValidationError);
  });
});
