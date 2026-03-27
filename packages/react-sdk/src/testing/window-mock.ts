import type { ArlopassTransport } from "@arlopass/web-sdk";

/**
 * Inject a mock transport as `window.arlopass`.
 */
export function mockWindowArlopass(transport: ArlopassTransport): void {
    (window as unknown as Record<string, unknown>).arlopass = transport;
}

/**
 * Remove `window.arlopass` to simulate extension not installed.
 */
export function cleanupWindowArlopass(): void {
    delete (window as unknown as Record<string, unknown>).arlopass;
}

/**
 * Simulate an external disconnect by removing `window.arlopass`
 * and calling the transport's disconnect if available.
 */
export async function simulateExternalDisconnect(transport: ArlopassTransport): Promise<void> {
    cleanupWindowArlopass();
    if (typeof transport.disconnect === "function") {
        await transport.disconnect("mock-session");
    }
}
