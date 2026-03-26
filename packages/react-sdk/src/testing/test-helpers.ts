import type { ClientStore } from "../store/client-store.js";
import type { ClientSnapshot } from "../store/snapshot.js";

const DEFAULT_TIMEOUT = 3000;
const POLL_INTERVAL = 50;

/**
 * Wait until the store snapshot matches the predicate.
 */
export async function waitForSnapshot(
    store: ClientStore,
    predicate: (snapshot: ClientSnapshot) => boolean,
    options: { timeout?: number } = {},
): Promise<ClientSnapshot> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const start = Date.now();

    return new Promise<ClientSnapshot>((resolve, reject) => {
        const check = () => {
            const snap = store.getSnapshot();
            if (predicate(snap)) {
                resolve(snap);
                return;
            }
            if (Date.now() - start > timeout) {
                reject(new Error(`waitForSnapshot timed out after ${timeout}ms`));
                return;
            }
            setTimeout(check, POLL_INTERVAL);
        };
        check();
    });
}

type Screen = {
    getByTestId: (id: string) => HTMLElement;
    findByTestId: (id: string) => Promise<HTMLElement>;
    queryByTestId: (id: string) => HTMLElement | null;
};

/**
 * Wait for an element with the given data-testid to appear.
 */
export async function waitForChat(
    screen: Screen,
    testId = "chat-ready",
): Promise<HTMLElement> {
    return screen.findByTestId(testId);
}

/**
 * Wait for streaming to finish by checking for a streaming-done
 * element or the absence of a streaming indicator.
 */
export async function waitForStream(
    screen: Screen,
    options: { timeout?: number } = {},
): Promise<void> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const start = Date.now();

    return new Promise<void>((resolve, reject) => {
        const check = () => {
            const streamingEl = screen.queryByTestId("streaming");
            if (streamingEl === null) {
                resolve();
                return;
            }
            if (Date.now() - start > timeout) {
                reject(new Error(`waitForStream timed out after ${timeout}ms`));
                return;
            }
            setTimeout(check, POLL_INTERVAL);
        };
        check();
    });
}

/**
 * Wait for an element with data-testid="state" to have the given text content.
 */
export async function waitForState(
    screen: Screen,
    state: string,
    options: { timeout?: number } = {},
): Promise<void> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const start = Date.now();

    return new Promise<void>((resolve, reject) => {
        const check = () => {
            const el = screen.queryByTestId("state");
            if (el !== null && el.textContent === state) {
                resolve();
                return;
            }
            if (Date.now() - start > timeout) {
                reject(new Error(`waitForState("${state}") timed out after ${timeout}ms`));
                return;
            }
            setTimeout(check, POLL_INTERVAL);
        };
        check();
    });
}
