/**
 * Tests for the wallet popup action client.
 *
 * Coverage:
 *  - Message envelope shape: channel, action, requestId, payload
 *  - Each action sends the correct action string and payload
 *  - Every call receives a distinct requestId
 *  - Success and failure responses are forwarded unchanged
 */
import { describe, expect, it, vi } from "vitest";

import {
  createWalletActionClient,
  type SendMessageFn,
  type WalletActionResponse,
} from "../ui/popup-actions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSendMessage(
  response: WalletActionResponse = { ok: true },
): SendMessageFn {
  return vi.fn().mockResolvedValue(response) as SendMessageFn;
}

// ---------------------------------------------------------------------------
// Envelope contract
// ---------------------------------------------------------------------------

describe("wallet action client — envelope contract", () => {
  it("sends channel: 'byom.wallet' for setActiveProvider", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.setActiveProvider({ providerId: "ollama" });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "byom.wallet" }),
    );
  });

  it("includes a non-empty string requestId", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.setActiveProvider({ providerId: "ollama" });

    const [call] = (sendMessage as ReturnType<typeof vi.fn>).mock.calls as [
      [{ requestId: string }],
    ];
    expect(typeof call[0].requestId).toBe("string");
    expect(call[0].requestId.length).toBeGreaterThan(0);
  });

  it("generates a unique requestId per call", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.setActiveProvider({ providerId: "a" });
    await client.setActiveProvider({ providerId: "b" });

    const calls = (sendMessage as ReturnType<typeof vi.fn>).mock.calls as [
      [{ requestId: string }],
      [{ requestId: string }],
    ];
    expect(calls[0][0].requestId).not.toBe(calls[1][0].requestId);
  });
});

// ---------------------------------------------------------------------------
// setActiveProvider
// ---------------------------------------------------------------------------

describe("wallet action client — setActiveProvider", () => {
  it("sends action wallet.setActiveProvider", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.setActiveProvider({ providerId: "ollama" });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "wallet.setActiveProvider" }),
    );
  });

  it("includes providerId in payload", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.setActiveProvider({ providerId: "ollama" });

    const [call] = (sendMessage as ReturnType<typeof vi.fn>).mock.calls as [
      [{ payload: { providerId: string } }],
    ];
    expect(call[0].payload).toMatchObject({ providerId: "ollama" });
  });

  it("includes optional modelId when provided", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.setActiveProvider({ providerId: "ollama", modelId: "llama3" });

    const [call] = (sendMessage as ReturnType<typeof vi.fn>).mock.calls as [
      [{ payload: { providerId: string; modelId: string } }],
    ];
    expect(call[0].payload).toMatchObject({ providerId: "ollama", modelId: "llama3" });
  });
});

// ---------------------------------------------------------------------------
// setActiveModel
// ---------------------------------------------------------------------------

describe("wallet action client — setActiveModel", () => {
  it("sends action wallet.setActiveModel", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.setActiveModel({ providerId: "ollama", modelId: "llama3" });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "wallet.setActiveModel" }),
    );
  });

  it("includes providerId and modelId in payload", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.setActiveModel({ providerId: "ollama", modelId: "llama3" });

    const [call] = (sendMessage as ReturnType<typeof vi.fn>).mock.calls as [
      [{ payload: { providerId: string; modelId: string } }],
    ];
    expect(call[0].payload).toMatchObject({ providerId: "ollama", modelId: "llama3" });
  });
});

// ---------------------------------------------------------------------------
// revokeProvider
// ---------------------------------------------------------------------------

describe("wallet action client — revokeProvider", () => {
  it("sends action wallet.revokeProvider", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.revokeProvider({ providerId: "ollama" });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "wallet.revokeProvider" }),
    );
  });

  it("includes providerId in payload", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.revokeProvider({ providerId: "ollama" });

    const [call] = (sendMessage as ReturnType<typeof vi.fn>).mock.calls as [
      [{ payload: { providerId: string } }],
    ];
    expect(call[0].payload).toMatchObject({ providerId: "ollama" });
  });
});

// ---------------------------------------------------------------------------
// openConnectFlow
// ---------------------------------------------------------------------------

describe("wallet action client — openConnectFlow", () => {
  it("sends action wallet.openConnectFlow", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.openConnectFlow();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "wallet.openConnectFlow" }),
    );
  });

  it("sends empty payload object", async () => {
    const sendMessage = makeSendMessage();
    const client = createWalletActionClient(sendMessage);

    await client.openConnectFlow();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ payload: {} }),
    );
  });
});

// ---------------------------------------------------------------------------
// Response forwarding
// ---------------------------------------------------------------------------

describe("wallet action client — response forwarding", () => {
  it("returns ok:true response unchanged", async () => {
    const sendMessage = makeSendMessage({ ok: true });
    const client = createWalletActionClient(sendMessage);

    const result = await client.setActiveProvider({ providerId: "ollama" });

    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false failure response unchanged", async () => {
    const sendMessage = makeSendMessage({
      ok: false,
      errorCode: "invalid_selection",
      message: "Unknown provider",
    });
    const client = createWalletActionClient(sendMessage);

    const result = await client.setActiveModel({
      providerId: "unknown",
      modelId: "x",
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "invalid_selection",
      message: "Unknown provider",
    });
  });

  it("returns connect_flow_unavailable error response", async () => {
    const sendMessage = makeSendMessage({
      ok: false,
      errorCode: "connect_flow_unavailable",
      message: "Options page is not available",
    });
    const client = createWalletActionClient(sendMessage);

    const result = await client.openConnectFlow();

    expect(result).toMatchObject({ ok: false, errorCode: "connect_flow_unavailable" });
  });
});
