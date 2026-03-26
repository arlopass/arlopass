import type { BYOMTransport } from "@byom-ai/web-sdk";

export function getInjectedTransport(): BYOMTransport | null {
    if (
        typeof window !== "undefined" &&
        window.byom !== undefined &&
        typeof window.byom.request === "function"
    ) {
        return window.byom as BYOMTransport;
    }
    return null;
}
