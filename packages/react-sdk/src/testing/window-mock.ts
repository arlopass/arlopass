import type { BYOMTransport } from "@byom-ai/web-sdk";

/**
 * Inject a mock transport as `window.byom`.
 */
export function mockWindowByom(transport: BYOMTransport): void {
  (window as unknown as Record<string, unknown>).byom = transport;
}

/**
 * Remove `window.byom` to simulate extension not installed.
 */
export function cleanupWindowByom(): void {
  delete (window as unknown as Record<string, unknown>).byom;
}

/**
 * Simulate an external disconnect by removing `window.byom`
 * and calling the transport's disconnect if available.
 */
export async function simulateExternalDisconnect(transport: BYOMTransport): Promise<void> {
  cleanupWindowByom();
  if (typeof transport.disconnect === "function") {
    await transport.disconnect("mock-session");
  }
}
