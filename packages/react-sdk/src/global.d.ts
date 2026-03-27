import type { ArlopassTransport } from "@arlopass/web-sdk";

declare global {
    interface Window {
        arlopass?: ArlopassTransport;
    }
}

export { };
