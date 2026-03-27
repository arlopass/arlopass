// apps/bridge/src/vault/vault-keychain.ts

export type KeychainAdapter = {
    getKey(): Promise<Buffer | null>;
    setKey(key: Buffer): Promise<void>;
    deleteKey(): Promise<void>;
};

/**
 * Stub keychain adapter that always throws.
 * Will be replaced with platform-specific implementations
 * (Windows Credential Manager, macOS Keychain, Linux libsecret).
 */
export function createKeychainAdapter(): KeychainAdapter {
    return {
        async getKey(): Promise<Buffer | null> {
            throw new Error("OS keychain not yet implemented. Use password mode.");
        },
        async setKey(_key: Buffer): Promise<void> {  // eslint-disable-line @typescript-eslint/no-unused-vars
            throw new Error("OS keychain not yet implemented. Use password mode.");
        },
        async deleteKey(): Promise<void> {
            throw new Error("OS keychain not yet implemented. Use password mode.");
        },
    };
}
