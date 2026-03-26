import { describe, expect, it } from "vitest";

import { TIMEOUT_BUDGETS } from "../cloud/timeout-budgets.js";

describe("TIMEOUT_BUDGETS", () => {
  it("pins stage timeout budgets to spec values", () => {
    expect(TIMEOUT_BUDGETS.handshakeMs).toBe(5_000);
    expect(TIMEOUT_BUDGETS.validationMs).toBe(10_000);
    expect(TIMEOUT_BUDGETS.discoveryMs).toBe(15_000);
    expect(TIMEOUT_BUDGETS.tokenRefreshMs).toBe(8_000);
    expect(TIMEOUT_BUDGETS.chatSendMs).toBe(60_000);
    expect(TIMEOUT_BUDGETS.streamSetupMs).toBe(15_000);
    expect(TIMEOUT_BUDGETS.healthProbeMs).toBe(5_000);
  });
});

