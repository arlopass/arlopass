import { describe, expect, it } from "vitest";
import { secureWipe } from "../vault/secure-wipe.js";

describe("secureWipe", () => {
    it("zeros a Buffer in-place", () => {
        const buf = Buffer.from([0xff, 0xab, 0x12, 0x99]);
        secureWipe(buf);
        expect(buf.every((b) => b === 0)).toBe(true);
    });

    it("zeros a Uint8Array in-place", () => {
        const arr = new Uint8Array([1, 2, 3, 4, 5]);
        secureWipe(arr);
        expect(Array.from(arr).every((b) => b === 0)).toBe(true);
    });

    it("handles empty buffer", () => {
        const buf = Buffer.alloc(0);
        secureWipe(buf);
        expect(buf.length).toBe(0);
    });
});
