import { useEffect, useState } from "react";
import { loadAppByOrigin, type ConnectedApp } from "../components/app-connect/app-storage.js";

export type ActiveTabApp = {
    app: ConnectedApp;
    tabOrigin: string;
};

/**
 * Detects if the current active tab's origin matches a connected app.
 * Returns the app if found, null otherwise.
 */
export function useActiveTabApp(): { activeApp: ActiveTabApp | null; loading: boolean } {
    const [activeApp, setActiveApp] = useState<ActiveTabApp | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function detect(): Promise<void> {
            try {
                // Query the active tab in the current window
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const tab = tabs[0];
                if (tab?.url == null || tab.url.length === 0) {
                    setActiveApp(null);
                    setLoading(false);
                    return;
                }

                let origin: string;
                try {
                    origin = new URL(tab.url).origin;
                } catch {
                    setActiveApp(null);
                    setLoading(false);
                    return;
                }

                // Skip chrome:// and extension pages
                if (origin.startsWith("chrome") || origin === "null") {
                    setActiveApp(null);
                    setLoading(false);
                    return;
                }

                const app = await loadAppByOrigin(origin);
                if (!cancelled) {
                    if (app !== null && app.status === "active") {
                        setActiveApp({ app, tabOrigin: origin });
                    } else {
                        setActiveApp(null);
                    }
                    setLoading(false);
                }
            } catch {
                if (!cancelled) {
                    setActiveApp(null);
                    setLoading(false);
                }
            }
        }

        void detect();

        // Re-check when app storage changes
        const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area === "local" && "byom.wallet.apps.v1" in changes) {
                void detect();
            }
        };
        chrome.storage.onChanged.addListener(listener);

        return () => {
            cancelled = true;
            chrome.storage.onChanged.removeListener(listener);
        };
    }, []);

    return { activeApp, loading };
}
