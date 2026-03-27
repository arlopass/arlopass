import type { ArlopassTransport } from "@arlopass/web-sdk";

export function getInjectedTransport(): ArlopassTransport | null {
    if (
        typeof window !== "undefined" &&
        window.arlopass !== undefined &&
        typeof window.arlopass.request === "function"
    ) {
        return window.arlopass as ArlopassTransport;
    }
    return null;
}
