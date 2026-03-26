import { describe, it, expect, afterEach } from "vitest";
import { getInjectedTransport } from "../transport/injected.js";

describe("getInjectedTransport", () => {
    const originalByom = window.byom;

    afterEach(() => {
        if (originalByom !== undefined) {
            window.byom = originalByom;
        } else {
            delete (window as unknown as Record<string, unknown>).byom;
        }
    });

    it("returns null when window.byom is not defined", () => {
        delete (window as unknown as Record<string, unknown>).byom;
        expect(getInjectedTransport()).toBeNull();
    });

    it("returns null when window.byom.request is not a function", () => {
        (window as unknown as Record<string, unknown>).byom = { notRequest: true };
        expect(getInjectedTransport()).toBeNull();
    });

    it("returns transport when window.byom has request function", () => {
        const mockTransport = {
            request: async () => ({ envelope: {} }),
            stream: async () => (async function* () { })(),
        };
        (window as unknown as Record<string, unknown>).byom = mockTransport;
        const result = getInjectedTransport();
        expect(result).toBe(mockTransport);
    });
});
