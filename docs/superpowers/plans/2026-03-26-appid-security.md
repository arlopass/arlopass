# AppId Security & App Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce appId-to-origin binding so apps can't impersonate other domains, auto-derive appIds for zero-friction DX, and add app metadata (name, description, icon) to the connect flow and extension UI.

**Architecture:** The SDK auto-derives an appId from `window.location.origin` using reverse-domain notation. The extension validates the appId matches the origin on every `session.create`. App metadata (name, description, icon) flows through the connect payload into storage and is rendered in the popup.

**Tech Stack:** TypeScript, Vitest, React + Mantine

**Spec:** `docs/superpowers/specs/2026-03-26-appid-security-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/web-sdk/src/app-id.ts` (new) | `deriveAppIdPrefix()`, `resolveAppId()`, `isDevOrigin()` |
| `packages/web-sdk/src/__tests__/app-id.test.ts` (new) | Tests |
| `packages/web-sdk/src/types.ts` (modify) | Update `ConnectOptions`, `ConnectPayload` |
| `packages/web-sdk/src/client.ts` (modify) | Auto-derive appId, send metadata |
| `packages/web-sdk/src/index.ts` (modify) | Export |
| `apps/extension/src/transport/runtime.ts` (modify) | Validate appId, extract metadata |
| `apps/extension/src/ui/components/app-connect/app-storage.ts` (modify) | Add fields to ConnectedApp |
| `apps/extension/src/ui/components/AppsTabContent.tsx` (modify) | Render icon + description |
| `apps/extension/src/ui/components/AppDetailView.tsx` (modify) | Render icon + description |
| `apps/extension/src/ui/components/app-connect/ApproveStep.tsx` (modify) | Show metadata in onboarding |

---

### Task 1: AppId Utilities

**Files:**
- Create: `packages/web-sdk/src/app-id.ts`
- Create: `packages/web-sdk/src/__tests__/app-id.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/web-sdk/src/__tests__/app-id.test.ts
import { describe, expect, it } from "vitest";
import { deriveAppIdPrefix, resolveAppId, isDevOrigin, validateAppIconUrl } from "../app-id.js";

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
```

- [ ] **Step 2: Write implementation**

```typescript
// packages/web-sdk/src/app-id.ts

export function deriveAppIdPrefix(origin: string): string {
  try {
    const hostname = new URL(origin).hostname;
    // IP addresses and localhost don't get reversed
    if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith("[")) {
      return hostname;
    }
    return hostname.split(".").reverse().join(".");
  } catch {
    return "app.unknown";
  }
}

export function resolveAppId(
  options: Readonly<{ appId?: string; appSuffix?: string }>,
  origin: string,
): string {
  if (options.appId !== undefined && options.appId.trim().length > 0) {
    return options.appId.trim();
  }
  const prefix = deriveAppIdPrefix(origin);
  if (options.appSuffix !== undefined && options.appSuffix.trim().length > 0) {
    return `${prefix}.${options.appSuffix.trim()}`;
  }
  return prefix;
}

export function isDevOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      origin.startsWith("chrome-extension://")
    );
  } catch {
    return false;
  }
}

export function validateAppIdForOrigin(
  appId: string,
  origin: string,
): { valid: boolean; reason?: string } {
  if (isDevOrigin(origin)) return { valid: true };

  try {
    const hostname = new URL(origin).hostname;
    const expectedPrefix = hostname.split(".").reverse().join(".");

    if (!appId.startsWith(expectedPrefix)) {
      return {
        valid: false,
        reason: `AppId "${appId}" does not match origin "${origin}". Expected prefix: "${expectedPrefix}".`,
      };
    }

    if (appId.length > expectedPrefix.length && appId[expectedPrefix.length] !== ".") {
      return {
        valid: false,
        reason: `AppId "${appId}" has invalid characters after domain prefix "${expectedPrefix}".`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: `Invalid origin: "${origin}".` };
  }
}

export function validateAppIconUrl(url: string, origin: string): boolean {
  if (url.length > 2048) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("https://")) return true;
  if (isDevOrigin(origin) && url.startsWith("http://")) return true;
  return false;
}
```

- [ ] **Step 3: Run tests, verify**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/app-id.test.ts`

- [ ] **Step 4: Export from index.ts**

Add to `packages/web-sdk/src/index.ts`:
```typescript
export { deriveAppIdPrefix, resolveAppId, isDevOrigin, validateAppIdForOrigin, validateAppIconUrl } from "./app-id.js";
```

- [ ] **Step 5: Commit**

---

### Task 2: Update SDK Types & Client

**Files:**
- Modify: `packages/web-sdk/src/types.ts`
- Modify: `packages/web-sdk/src/client.ts`

- [ ] **Step 1: Update ConnectOptions type**

In `types.ts`, change `ConnectOptions`:
```typescript
export type ConnectOptions = Readonly<{
  appId?: string;
  appSuffix?: string;
  appName?: string;
  appDescription?: string;
  appIcon?: string;
  origin?: string;
  timeoutMs?: number;
}>;
```

Update `ConnectPayload`:
```typescript
export type ConnectPayload = Readonly<{
  appId: string;
  requestedCapabilities: readonly ProtocolCapability[];
  appName?: string;
  appDescription?: string;
  appIcon?: string;
}>;
```

- [ ] **Step 2: Update client.connect()**

In `client.ts`, update the `connect` method:
- Import `resolveAppId` and `validateAppIconUrl` from `./app-id.js`
- Replace `const appId = assertNonEmptyString(options.appId, "appId")` with:
  ```typescript
  const origin = options.origin ?? this.#config.origin;
  const appId = resolveAppId(options, origin);
  ```
- Add metadata to payload:
  ```typescript
  payload: {
    appId,
    requestedCapabilities: this.#config.defaultCapabilities,
    ...(options.appName !== undefined ? { appName: options.appName } : {}),
    ...(options.appDescription !== undefined ? { appDescription: options.appDescription } : {}),
    ...(options.appIcon !== undefined && validateAppIconUrl(options.appIcon, origin) ? { appIcon: options.appIcon } : {}),
  },
  ```

- [ ] **Step 3: Run existing tests, fix any breakage**

Existing tests call `client.connect({ appId: "app.test" })`. These should still work since `appId` is still accepted.

Run: `cd packages/web-sdk && npx vitest run`

- [ ] **Step 4: Commit**

---

### Task 3: Extension Validation

**Files:**
- Modify: `apps/extension/src/transport/runtime.ts`

- [ ] **Step 1: Add validation on session.create**

Import: `import { validateAppIdForOrigin, validateAppIconUrl, isDevOrigin } from "@byom-ai/web-sdk";`

Or inline the functions to avoid the dependency (the extension bundles its own code). Better: copy the pure functions to avoid SDK dependency from extension transport.

In `dispatchTransportRequest`, in the `session.create` case, after extracting `appId` from payload:

```typescript
case "session.create": {
  const payload = options.envelope.payload as Record<string, unknown>;
  if (isRecord(payload) && typeof payload["appId"] === "string") {
    const appId = payload["appId"] as string;

    // Validate appId matches origin
    const validation = validateAppIdForOrigin(appId, options.envelope.origin);
    if (!validation.valid) {
      throw new EnvelopeValidationError(
        validation.reason ?? "AppId does not match origin.",
        {
          reasonCode: "policy.denied",
          details: {
            appId,
            origin: options.envelope.origin,
          },
        },
      );
    }

    // Extract and store app metadata for the onboarding flow
    const appName = typeof payload["appName"] === "string" ? payload["appName"].trim().slice(0, 200) : undefined;
    const appDescription = typeof payload["appDescription"] === "string" ? payload["appDescription"].trim().slice(0, 500) : undefined;
    const appIcon = typeof payload["appIcon"] === "string" && validateAppIconUrl(payload["appIcon"], options.envelope.origin)
      ? payload["appIcon"]
      : undefined;

    // Store pending connection metadata for the popup onboarding wizard
    await options.storage.set({
      "byom.wallet.pendingConnect.v1": {
        origin: options.envelope.origin,
        appId,
        appName,
        appDescription,
        appIcon,
        requestedAt: Date.now(),
      },
    });

    const response: ConnectResponsePayload = {
      capabilities: DEFAULT_CAPABILITIES,
    };
    return response;
  }
  // ... existing session.create logic
}
```

- [ ] **Step 2: Add validation tests**

Add to `apps/extension/src/__tests__/transport-runtime.test.ts`:

```typescript
it("rejects session.create with mismatched appId", async () => {
  // appId "com.evil.app" from origin "https://example.com" → policy.denied
});

it("accepts session.create with matching appId", async () => {
  // appId "com.example.app" from origin "https://example.com" → ok
});

it("accepts any appId from localhost origins", async () => {
  // appId "anything" from origin "http://localhost:3000" → ok
});
```

- [ ] **Step 3: Run tests, commit**

---

### Task 4: Storage & UI Updates

**Files:**
- Modify: `apps/extension/src/ui/components/app-connect/app-storage.ts`
- Modify: `apps/extension/src/ui/components/AppsTabContent.tsx`
- Modify: `apps/extension/src/ui/components/AppDetailView.tsx`
- Modify: `apps/extension/src/ui/components/app-connect/ApproveStep.tsx`

- [ ] **Step 1: Update ConnectedApp type**

In `app-storage.ts`, add fields:
```typescript
export type ConnectedApp = {
    id: string;
    origin: string;
    appId: string;              // NEW
    displayName: string;
    description?: string;       // NEW
    iconUrl?: string;           // NEW
    // ... rest unchanged
};
```

Update `saveApp` to accept and store these fields.

- [ ] **Step 2: Update AppsTabContent to show icon + description**

In the `AppCard` component, render the icon:
```tsx
{app.iconUrl ? (
  <img src={app.iconUrl} alt="" width={32} height={32} style={{ borderRadius: 6 }} />
) : (
  <IconPlugConnected size={32} color={tokens.color.textSecondary} />
)}
```

Show description below the name.

- [ ] **Step 3: Update AppDetailView header**

Show icon + description in the app detail header area.

- [ ] **Step 4: Update ApproveStep**

Show icon, app name, and description during the onboarding approval step.

- [ ] **Step 5: Verify compilation + tests**

Run: `cd apps/extension && npx tsc --noEmit && npx vitest run`

- [ ] **Step 6: Commit**

---

### Task 5: Update Examples App

- [ ] **Step 1: Update connect calls in App.tsx**

Update the `doConnect` function to use the new simplified API:
```typescript
const c = new BYOMClient({ transport: r.transport, origin, timeoutMs: tMs });
const res = await c.connect({
  appSuffix: "examples",
  appName: "BYOM Examples",
  appDescription: "Interactive SDK examples and documentation",
  appIcon: "https://byom.ai/icon-64.png", // or omit for dev
});
```

- [ ] **Step 2: Update ChatSidebar connect**

Similarly update the sidebar's `autoConnect` to use the new API.

- [ ] **Step 3: Add documentation page**

Add a section to the examples app documenting the appId security feature.

- [ ] **Step 4: Verify compilation**

Run: `cd apps/examples-web && npx tsc --noEmit`

- [ ] **Step 5: Commit**

---

### Task 6: Final Integration

- [ ] **Step 1: Run full test suite**
- [ ] **Step 2: Build all packages**
- [ ] **Step 3: Verify examples app compiles**
