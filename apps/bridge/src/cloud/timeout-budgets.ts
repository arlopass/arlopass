export type StageTimeoutBudgets = Readonly<{
  handshakeMs: number;
  validationMs: number;
  discoveryMs: number;
  tokenRefreshMs: number;
  chatSendMs: number;
  streamSetupMs: number;
  healthProbeMs: number;
}>;

export const TIMEOUT_BUDGETS: StageTimeoutBudgets = Object.freeze({
  handshakeMs: 5_000,
  validationMs: 10_000,
  discoveryMs: 15_000,
  tokenRefreshMs: 8_000,
  chatSendMs: 60_000,
  streamSetupMs: 15_000,
  healthProbeMs: 5_000,
});

