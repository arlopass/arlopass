import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type LockoutState = {
    failedAttempts: number;
    lastFailedAt: string | null;
    lockedUntil: string | null;
};

function emptyState(): LockoutState {
    return { failedAttempts: 0, lastFailedAt: null, lockedUntil: null };
}

// 5 failures → 30s, 10 → 300s, 20+ → 1800s
function computeLockoutSeconds(failedAttempts: number): number {
    if (failedAttempts >= 20) return 1800;
    if (failedAttempts >= 10) return 300;
    if (failedAttempts >= 5) return 30;
    return 0;
}

export class VaultLockout {
    readonly #filePath: string;
    readonly #now: () => number;
    #state: LockoutState;

    constructor(filePath: string, now?: () => number) {
        this.#filePath = filePath;
        this.#now = now ?? (() => Date.now());
        this.#state = this.#load();
    }

    isLockedOut(): boolean {
        if (this.#state.lockedUntil === null) return false;
        return this.#now() < new Date(this.#state.lockedUntil).getTime();
    }

    getSecondsUntilRetry(): number {
        if (this.#state.lockedUntil === null) return 0;
        const remaining = new Date(this.#state.lockedUntil).getTime() - this.#now();
        return Math.max(0, Math.ceil(remaining / 1000));
    }

    getFailedAttempts(): number {
        return this.#state.failedAttempts;
    }

    recordFailure(): void {
        this.#state.failedAttempts += 1;
        this.#state.lastFailedAt = new Date(this.#now()).toISOString();
        const lockSeconds = computeLockoutSeconds(this.#state.failedAttempts);
        if (lockSeconds > 0) {
            this.#state.lockedUntil = new Date(this.#now() + lockSeconds * 1000).toISOString();
        }
        this.#save();
    }

    reset(): void {
        this.#state = emptyState();
        this.#save();
    }

    #load(): LockoutState {
        if (!existsSync(this.#filePath)) return emptyState();
        try {
            const raw: unknown = JSON.parse(readFileSync(this.#filePath, "utf8"));
            if (
                typeof raw === "object" && raw !== null && !Array.isArray(raw) &&
                typeof (raw as Record<string, unknown>)["failedAttempts"] === "number"
            ) {
                const r = raw as Record<string, unknown>;
                return {
                    failedAttempts: r["failedAttempts"] as number,
                    lastFailedAt: typeof r["lastFailedAt"] === "string" ? r["lastFailedAt"] : null,
                    lockedUntil: typeof r["lockedUntil"] === "string" ? r["lockedUntil"] : null,
                };
            }
        } catch { /* corrupted — reset */ }
        return emptyState();
    }

    #save(): void {
        const dir = dirname(this.#filePath);
        mkdirSync(dir, { recursive: true });
        const tmp = `${this.#filePath}.tmp`;
        writeFileSync(tmp, JSON.stringify(this.#state, null, 2), "utf8");
        renameSync(tmp, this.#filePath);
    }
}
