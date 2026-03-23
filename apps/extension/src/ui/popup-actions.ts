/**
 * Wallet popup action client.
 *
 * Sends typed `chrome.runtime.sendMessage` envelopes to the background
 * service worker over the `byom.wallet` channel.  The `sendMessage`
 * dependency is injected so callers can substitute a test double.
 */

// ---------------------------------------------------------------------------
// Envelope and response types (popup → background)
// ---------------------------------------------------------------------------

export type WalletMessageEnvelope = Readonly<{
  channel: "byom.wallet";
  action: string;
  requestId: string;
  payload: object;
}>;

export type WalletActionSuccess = Readonly<{ ok: true; data?: object }>;
export type WalletActionFailure = Readonly<{
  ok: false;
  errorCode: string;
  message: string;
}>;
export type WalletActionResponse = WalletActionSuccess | WalletActionFailure;

/** Matches the signature of `chrome.runtime.sendMessage` (promise variant). */
export type SendMessageFn = (
  message: WalletMessageEnvelope,
) => Promise<WalletActionResponse>;

// ---------------------------------------------------------------------------
// Action payload types
// ---------------------------------------------------------------------------

export type SetActiveProviderPayload = Readonly<{
  providerId: string;
  modelId?: string;
}>;

export type SetActiveModelPayload = Readonly<{
  providerId: string;
  modelId: string;
}>;

export type RevokeProviderPayload = Readonly<{
  providerId: string;
}>;

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export type WalletActionClient = Readonly<{
  setActiveProvider(payload: SetActiveProviderPayload): Promise<WalletActionResponse>;
  setActiveModel(payload: SetActiveModelPayload): Promise<WalletActionResponse>;
  revokeProvider(payload: RevokeProviderPayload): Promise<WalletActionResponse>;
  openConnectFlow(): Promise<WalletActionResponse>;
}>;

// ---------------------------------------------------------------------------
// Request-ID generation
// ---------------------------------------------------------------------------

let _seq = 0;

function generateRequestId(): string {
  _seq += 1;
  return `byom.wallet.${Date.now()}.${_seq}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWalletActionClient(sendMessage: SendMessageFn): WalletActionClient {
  function send(action: string, payload: object): Promise<WalletActionResponse> {
    return sendMessage({
      channel: "byom.wallet",
      action,
      requestId: generateRequestId(),
      payload,
    });
  }

  return {
    setActiveProvider: (payload) => send("wallet.setActiveProvider", payload),
    setActiveModel: (payload) => send("wallet.setActiveModel", payload),
    revokeProvider: (payload) => send("wallet.revokeProvider", payload),
    openConnectFlow: () => send("wallet.openConnectFlow", {}),
  };
}
