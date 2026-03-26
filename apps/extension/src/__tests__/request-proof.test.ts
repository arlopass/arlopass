import { describe, expect, it } from "vitest";

import {
  buildCloudRequestProof,
  computeCloudRequestPayloadHash,
} from "../transport/request-proof.js";

function hexToBytes(hexValue: string): Uint8Array {
  const normalized = hexValue.trim().toLowerCase();
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

describe("request-proof", () => {
  it("computes deterministic payload hashes for semantically equal payloads", async () => {
    const payloadA = {
      b: 2,
      a: 1,
      nested: {
        y: [1, 2, 3],
        x: "value",
      },
    };
    const payloadB = {
      nested: {
        x: "value",
        y: [1, 2, 3],
      },
      a: 1,
      b: 2,
    };

    const hashA = await computeCloudRequestPayloadHash(payloadA);
    const hashB = await computeCloudRequestPayloadHash(payloadB);

    expect(hashA).toBe(hashB);
    expect(hashA.startsWith("sha256:")).toBe(true);
  });

  it("builds deterministic request-bound proof payload", async () => {
    const sessionKey = hexToBytes("11".repeat(32));

    const proofA = await buildCloudRequestProof({
      requestId: "req.123",
      nonce: "nonce.123",
      origin: "https://app.example.com",
      connectionHandle:
        "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
      payloadHash: "sha256:abc123",
      sessionKey,
    });
    const proofB = await buildCloudRequestProof({
      requestId: "req.123",
      nonce: "nonce.123",
      origin: "https://app.example.com",
      connectionHandle:
        "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
      payloadHash: "sha256:abc123",
      sessionKey,
    });

    expect(proofA).toEqual(proofB);
    expect(proofA.requestId).toBe("req.123");
    expect(proofA.nonce).toBe("nonce.123");
    expect(proofA.origin).toBe("https://app.example.com");
    expect(proofA.connectionHandle).toContain("connh.provider.claude");
    expect(typeof proofA.proof).toBe("string");
    expect(proofA.proof.length).toBeGreaterThan(10);
  });

  it("changes proof when bound fields change", async () => {
    const sessionKey = hexToBytes("22".repeat(32));

    const first = await buildCloudRequestProof({
      requestId: "req.123",
      nonce: "nonce.one",
      origin: "https://app.example.com",
      connectionHandle:
        "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
      payloadHash: "sha256:abc123",
      sessionKey,
    });
    const second = await buildCloudRequestProof({
      requestId: "req.123",
      nonce: "nonce.two",
      origin: "https://app.example.com",
      connectionHandle:
        "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
      payloadHash: "sha256:abc123",
      sessionKey,
    });

    expect(first.proof).not.toBe(second.proof);
  });
});
