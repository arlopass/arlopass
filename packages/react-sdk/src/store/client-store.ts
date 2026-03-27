import type { ArlopassClient, ArlopassSDKError } from "@arlopass/web-sdk";
import type { ProviderDescriptor } from "../types.js";
import {
    buildSnapshot,
    createInitialSnapshot,
    snapshotsEqual,
    EMPTY_PROVIDERS,
    type ClientSnapshot,
} from "./snapshot.js";
import { Subscriptions } from "./subscriptions.js";

const HEARTBEAT_INTERVAL_MS = 500;

export class ClientStore {
    readonly #client: ArlopassClient;
    readonly #subscriptions = new Subscriptions();
    #snapshot: ClientSnapshot;
    #heartbeatId: ReturnType<typeof setInterval> | null = null;
    #providers: readonly ProviderDescriptor[] = EMPTY_PROVIDERS;
    #error: ArlopassSDKError | null = null;

    constructor(client: ArlopassClient) {
        this.#client = client;
        this.#snapshot = createInitialSnapshot();
        this.#startHeartbeat();
    }

    getSnapshot(): ClientSnapshot {
        return this.#snapshot;
    }

    subscribe(listener: () => void): () => void {
        return this.#subscriptions.subscribe(listener);
    }

    refreshSnapshot(): void {
        const next = buildSnapshot({
            state: this.#client.state,
            sessionId: this.#client.sessionId ?? null,
            selectedProvider: this.#client.selectedProvider ?? null,
            providers: this.#providers,
            error: this.#error,
        });

        if (!snapshotsEqual(this.#snapshot, next)) {
            this.#snapshot = next;
            this.#subscriptions.notify();
        }
    }

    setError(error: ArlopassSDKError | null): void {
        this.#error = error;
        this.refreshSnapshot();
    }

    setProviders(providers: readonly ProviderDescriptor[]): void {
        this.#providers = providers;
        this.refreshSnapshot();
    }

    clearError(): void {
        this.#error = null;
        this.refreshSnapshot();
    }

    get client(): ArlopassClient {
        return this.#client;
    }

    destroy(): void {
        this.#stopHeartbeat();
        this.#subscriptions.clear();
    }

    #startHeartbeat(): void {
        if (typeof setInterval === "undefined") return;
        this.#heartbeatId = setInterval(() => {
            this.refreshSnapshot();
        }, HEARTBEAT_INTERVAL_MS);
    }

    #stopHeartbeat(): void {
        if (this.#heartbeatId !== null) {
            clearInterval(this.#heartbeatId);
            this.#heartbeatId = null;
        }
    }
}
