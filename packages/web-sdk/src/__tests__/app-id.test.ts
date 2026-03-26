import { describe, expect, it } from "vitest";
import { deriveAppIdPrefix, resolveAppId, isDevOrigin, validateAppIdForOrigin, validateAppIconUrl } from "../app-id.js";

describe("deriveAppIdPrefix", () => {
    it("converts simple domain", () => {
        expect(deriveAppIdPrefix("https://example.com")).toBe("com.example");
    });
    it("converts subdomain", () => {
        expect(deriveAppIdPrefix("https://app.example.com")).toBe("com.example.app");
    });
    it("handles port", () => {
        expect(deriveAppIdPrefix("https://example.com:8080")).toBe("com.example");
    });
    it("handles localhost", () => {
        expect(deriveAppIdPrefix("http://localhost:3000")).toBe("localhost");
    });
    it("handles IP address", () => {
        expect(deriveAppIdPrefix("http://127.0.0.1:5173")).toBe("127.0.0.1");
    });
});

describe("resolveAppId", () => {
    const origin = "https://example.com";
    it("auto-derives when nothing provided", () => {
        expect(resolveAppId({}, origin)).toBe("com.example");
    });
    it("appends suffix", () => {
        expect(resolveAppId({ appSuffix: "dashboard" }, origin)).toBe("com.example.dashboard");
    });
    it("uses explicit appId when provided", () => {
        expect(resolveAppId({ appId: "com.example.custom" }, origin)).toBe("com.example.custom");
    });
    it("prefers appId over appSuffix", () => {
        expect(resolveAppId({ appId: "com.example.explicit", appSuffix: "ignored" }, origin)).toBe("com.example.explicit");
    });
});

describe("isDevOrigin", () => {
    it("returns true for localhost", () => {
        expect(isDevOrigin("http://localhost:3000")).toBe(true);
    });
    it("returns true for 127.0.0.1", () => {
        expect(isDevOrigin("http://127.0.0.1:5173")).toBe(true);
    });
    it("returns true for [::1]", () => {
        expect(isDevOrigin("http://[::1]:3000")).toBe(true);
    });
    it("returns true for .local", () => {
        expect(isDevOrigin("http://myhost.local")).toBe(true);
    });
    it("returns true for chrome-extension", () => {
        expect(isDevOrigin("chrome-extension://abcdef")).toBe(true);
    });
    it("returns false for production domain", () => {
        expect(isDevOrigin("https://example.com")).toBe(false);
    });
});

describe("validateAppIdForOrigin", () => {
    it("accepts matching appId", () => {
        expect(validateAppIdForOrigin("com.example", "https://example.com").valid).toBe(true);
    });
    it("accepts matching appId with suffix", () => {
        expect(validateAppIdForOrigin("com.example.dashboard", "https://example.com").valid).toBe(true);
    });
    it("accepts subdomain appId", () => {
        expect(validateAppIdForOrigin("com.example.app", "https://app.example.com").valid).toBe(true);
    });
    it("rejects mismatched appId", () => {
        const result = validateAppIdForOrigin("com.evil", "https://example.com");
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("does not match");
    });
    it("rejects appId with bad suffix chars", () => {
        const result = validateAppIdForOrigin("com.exampleXYZ", "https://example.com");
        expect(result.valid).toBe(false);
    });
    it("accepts any appId for dev origins", () => {
        expect(validateAppIdForOrigin("anything.goes", "http://localhost:3000").valid).toBe(true);
    });
});

describe("validateAppIconUrl", () => {
    it("accepts https URLs", () => {
        expect(validateAppIconUrl("https://example.com/icon.png", "https://example.com")).toBe(true);
    });
    it("accepts data URIs", () => {
        expect(validateAppIconUrl("data:image/png;base64,abc", "https://example.com")).toBe(true);
    });
    it("rejects http for production origins", () => {
        expect(validateAppIconUrl("http://example.com/icon.png", "https://example.com")).toBe(false);
    });
    it("accepts http for dev origins", () => {
        expect(validateAppIconUrl("http://localhost:3000/icon.png", "http://localhost:3000")).toBe(true);
    });
    it("rejects excessively long URLs", () => {
        expect(validateAppIconUrl("https://example.com/" + "a".repeat(2048), "https://example.com")).toBe(false);
    });
});
