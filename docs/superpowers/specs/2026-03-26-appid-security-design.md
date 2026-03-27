# AppId Security & App Metadata Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** `@arlopass/web-sdk`, `@arlopass/protocol`, extension transport runtime, extension popup UI

---

## 1. Problem Statement

The current SDK accepts any `appId` string without validation. A malicious site at `evil.com` can claim `appId: "com.bank.app"` and the extension won't reject it. The `appId` is not bound to the page's origin in any way.

Additionally, connected apps have no metadata beyond a display name derived from the origin — no icon, no description.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AppId format | Reverse-domain notation | Industry standard (Android/iOS), maps cleanly to hostnames |
| Derivation | SDK auto-derives from origin | Zero-friction DX — developers don't need to think about format |
| Localhost handling | Dev origins exempt from validation | No friction during development |
| Enforcement | Strict from day one | Pre-release, no existing users to migrate |
| Validation location | SDK auto-generates + extension validates | Defense in depth |
| App metadata | Name, description, icon in ConnectPayload | Rich app cards in extension popup |

---

## 3. Connect API

### ConnectOptions (SDK)
```typescript
type ConnectOptions = Readonly<{
  /** Full appId (reverse-domain). Auto-derived from origin if omitted. */
  appId?: string;
  /** Suffix appended to the auto-derived domain prefix. Ignored if appId is set. */
  appSuffix?: string;
  /** Human-readable app name. Defaults to origin hostname. */
  appName?: string;
  /** Short app description. */
  appDescription?: string;
  /** URL to square icon/logo (https:// or data: URI). */
  appIcon?: string;
  origin?: string;
  timeoutMs?: number;
}>;
```

### ConnectPayload (Protocol)
```typescript
type ConnectPayload = Readonly<{
  appId: string;
  requestedCapabilities: readonly ProtocolCapability[];
  appName?: string;
  appDescription?: string;
  appIcon?: string;
}>;
```

### Resolution Order
1. `appId` provided → use directly (validated against origin by extension)
2. `appSuffix` provided → `derivePrefix(origin) + "." + appSuffix`
3. Neither → `derivePrefix(origin)` alone

### Examples
```typescript
// From https://example.com
await client.connect({});
// → appId: "com.example"

await client.connect({ appSuffix: "dashboard" });
// → appId: "com.example.dashboard"

await client.connect({
  appSuffix: "dashboard",
  appName: "Acme Dashboard",
  appDescription: "AI-powered analytics",
  appIcon: "https://acme.com/icon.png",
});
// → appId: "com.example.dashboard", with metadata

await client.connect({ appId: "com.example.legacy" });
// → appId: "com.example.legacy" (explicit, still validated)
```

---

## 4. AppId Derivation

```typescript
function deriveAppIdPrefix(origin: string): string {
  const hostname = new URL(origin).hostname;
  // "app.example.com" → "com.example.app"
  return hostname.split(".").reverse().join(".");
}
```

---

## 5. Extension Validation

On `session.create`, before accepting the connection:

```typescript
function validateAppIdForOrigin(appId: string, origin: string): { valid: boolean; reason?: string } {
  if (isDevOrigin(origin)) return { valid: true };

  const hostname = new URL(origin).hostname;
  const expectedPrefix = hostname.split(".").reverse().join(".");

  if (!appId.startsWith(expectedPrefix)) {
    return {
      valid: false,
      reason: `AppId "${appId}" does not match origin "${origin}". Expected prefix: "${expectedPrefix}".`,
    };
  }

  // After prefix, next char must be "." or end-of-string
  if (appId.length > expectedPrefix.length && appId[expectedPrefix.length] !== ".") {
    return {
      valid: false,
      reason: `AppId "${appId}" has invalid characters after domain prefix.`,
    };
  }

  return { valid: true };
}

function isDevOrigin(origin: string): boolean {
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
```

**Rejection**: Returns `policy.denied` error with message explaining expected format.

---

## 6. App Icon Security

- Only `https://` and `data:` URIs accepted
- Dev origins (`localhost` etc.) also accept `http://`
- Rendered as `<img src>` only — no script execution
- Maximum URL length: 2048 characters
- Extension CSP already blocks inline scripts

```typescript
function validateAppIconUrl(url: string, origin: string): boolean {
  if (url.length > 2048) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("https://")) return true;
  if (isDevOrigin(origin) && url.startsWith("http://")) return true;
  return false;
}
```

---

## 7. Storage Update

```typescript
type ConnectedApp = {
  id: string;
  origin: string;
  appId: string;           // NEW — validated reverse-domain appId
  displayName: string;     // set from appName, falls back to hostname
  description?: string;    // NEW
  iconUrl?: string;        // NEW
  enabledProviderIds: string[];
  enabledModelIds: string[];
  permissions: AppPermissions;
  rules: AppRules;
  limits: AppLimits;
  tokenUsage: number;
  lastUsedAt: number;
  createdAt: number;
  status: "active" | "disabled";
};
```

---

## 8. UI Updates

### AppsTabContent (app cards)
- Show `iconUrl` as a small image next to the app name (fallback: `IconPlugConnected`)
- Show `description` below the name as secondary text

### AppDetailView (detail header)
- Show icon in the header alongside app name
- Show description below the title

### App Approval (onboarding wizard)
- Show app icon, name, and description during the approval step
- Display the validated appId for transparency

---

## 9. File Changes

| File | Change |
|------|--------|
| `packages/web-sdk/src/app-id.ts` (new) | `deriveAppIdPrefix()`, `resolveAppId()`, `isDevOrigin()` |
| `packages/web-sdk/src/types.ts` (modify) | Update `ConnectOptions`, `ConnectPayload` |
| `packages/web-sdk/src/client.ts` (modify) | Auto-derive appId, send metadata in payload |
| `packages/web-sdk/src/index.ts` (modify) | Export new utilities |
| `apps/extension/src/transport/runtime.ts` (modify) | `validateAppIdForOrigin()`, extract metadata on `session.create` |
| `apps/extension/src/ui/components/app-connect/app-storage.ts` (modify) | Add `appId`, `description`, `iconUrl` to `ConnectedApp` |
| `apps/extension/src/ui/components/AppsTabContent.tsx` (modify) | Render icon + description |
| `apps/extension/src/ui/components/AppDetailView.tsx` (modify) | Render icon + description in header |
| `apps/extension/src/ui/components/app-connect/ApproveStep.tsx` (modify) | Show icon/name/description during approval |
| `packages/web-sdk/src/__tests__/app-id.test.ts` (new) | Derivation + validation tests |
| `apps/extension/src/__tests__/transport-runtime.test.ts` (modify) | AppId rejection tests |
