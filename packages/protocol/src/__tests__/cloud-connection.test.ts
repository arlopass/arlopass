import { describe, expect, it } from "vitest";

import {
  parseCloudConnectionHandle,
  parseCloudRequestProof,
} from "../cloud-connection.js";
import { EnvelopeValidationError } from "../errors.js";

const VALID_CONNECTION_HANDLE_INPUT = {
  connectionHandle:
    "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.7.a1b2",
  providerId: "provider.claude",
  methodId: "anthropic.api_key",
  extensionId: "abcdefghijklmnopqrstuvwxzy123456",
  origin: "https://app.example.com",
};

const VALID_REQUEST_PROOF_INPUT = {
  requestId: "req.12345",
  nonce: "nonce.67890",
  origin: "https://app.example.com",
  connectionHandle: VALID_CONNECTION_HANDLE_INPUT.connectionHandle,
  payloadHash: "sha256:9b74c9897bac770ffc029102a200c5de",
  proof: "proof-token-123",
};

describe("parseCloudConnectionHandle", () => {
  it("normalizes and validates a bound cloud connection handle", () => {
    const parsed = parseCloudConnectionHandle(VALID_CONNECTION_HANDLE_INPUT);

    expect(parsed.bindingEpoch).toBe(7);
    expect(parsed.providerId).toBe("provider.claude");
    expect(parsed.signature).toBe("a1b2");
  });

  it("rejects connection handles that do not match the provided provider", () => {
    expect(() =>
      parseCloudConnectionHandle({
        ...VALID_CONNECTION_HANDLE_INPUT,
        providerId: "provider.other",
      }),
    ).toThrowError(EnvelopeValidationError);

    try {
      parseCloudConnectionHandle({
        ...VALID_CONNECTION_HANDLE_INPUT,
        providerId: "provider.other",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvelopeValidationError);
      if (error instanceof EnvelopeValidationError) {
        expect(error.reasonCode).toBe("request.invalid");
        expect(error.details).toMatchObject({
          field: "connectionHandle",
        });
      }
    }
  });

  it("tolerates unknown optional top-level fields", () => {
    const parsed = parseCloudConnectionHandle({
      ...VALID_CONNECTION_HANDLE_INPUT,
      optionalFutureField: "ignored",
    });

    expect(parsed.providerId).toBe("provider.claude");
  });
});

describe("parseCloudRequestProof", () => {
  it("accepts a valid cloud request proof payload", () => {
    const parsed = parseCloudRequestProof(VALID_REQUEST_PROOF_INPUT);

    expect(parsed).toMatchObject(VALID_REQUEST_PROOF_INPUT);
  });

  it("rejects missing required request proof fields", () => {
    const invalid: Record<string, unknown> = {
      ...VALID_REQUEST_PROOF_INPUT,
    };
    delete invalid.proof;

    expect(() => parseCloudRequestProof(invalid)).toThrowError(
      EnvelopeValidationError,
    );

    try {
      parseCloudRequestProof(invalid);
    } catch (error) {
      expect(error).toBeInstanceOf(EnvelopeValidationError);
      if (error instanceof EnvelopeValidationError) {
        expect(error.reasonCode).toBe("request.invalid");
        expect(error.details).toMatchObject({
          field: "proof",
        });
      }
    }
  });
});
