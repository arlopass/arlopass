import { useSyncExternalStore } from "react";

function getRouteFromHash(): string {
    const hash = window.location.hash.replace(/^#\/?/, "");
    return hash || "getting-started/welcome";
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

window.addEventListener("hashchange", () => {
    for (const cb of listeners) cb();
});

export function useRoute(): string {
    return useSyncExternalStore(subscribe, getRouteFromHash, getRouteFromHash);
}

export function navigate(pageId: string): void {
    window.location.hash = `#/${pageId}`;
}
