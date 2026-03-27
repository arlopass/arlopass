import { describe, it, expect, afterEach } from "vitest";
import { getInjectedTransport } from "../transport/injected.js";

describe("getInjectedTransport", () => {
    const originalArlopass = window.arlopass;

    afterEach(() => {
        if (originalArlopass !== undefined) {
            window.arlopass = originalArlopass;
        } else {
            delete (window as unknown as Record<string, unknown>).arlopass;
        }
    });

    it("returns null when window.arlopass is not defined", () => {
        delete (window as unknown as Record<string, unknown>).arlopass;
        expect(getInjectedTransport()).toBeNull();
    });

    it("returns null when window.arlopass.request is not a function", () => {
        (window as unknown as Record<string, unknown>).arlopass = { notRequest: true };
        expect(getInjectedTransport()).toBeNull();
    });

    it("returns transport when window.arlopass has request function", () => {
        const mockTransport = {
            request: async () => ({ envelope: {} }),
            stream: async () => (async function* () { })(),
        };
        (window as unknown as Record<string, unknown>).arlopass = mockTransport;
        const result = getInjectedTransport();
        expect(result).toBe(mockTransport);
    });
});
