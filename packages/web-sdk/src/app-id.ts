export function deriveAppIdPrefix(origin: string): string {
    try {
        const hostname = new URL(origin).hostname;
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
