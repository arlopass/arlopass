import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

type BridgeState = {
    version: 1;
    signingKey: string;
    createdAt: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function readOrCreateBridgeState(stateFilePath: string): BridgeState {
    if (existsSync(stateFilePath)) {
        try {
            const parsed: unknown = JSON.parse(readFileSync(stateFilePath, "utf8"));
            if (isRecord(parsed) && parsed["version"] === 1 &&
                typeof parsed["signingKey"] === "string" &&
                /^[0-9a-f]{64}$/i.test(parsed["signingKey"])) {
                return parsed as BridgeState;
            }
        } catch { /* corrupted — regenerate */ }
    }

    const state: BridgeState = {
        version: 1,
        signingKey: randomBytes(32).toString("hex"),
        createdAt: new Date().toISOString(),
    };

    const dir = dirname(stateFilePath);
    mkdirSync(dir, { recursive: true });
    const tmp = `${stateFilePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, stateFilePath);
    return state;
}
