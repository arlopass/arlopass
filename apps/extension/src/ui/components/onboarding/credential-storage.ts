/**
 * Credential storage for the popup onboarding wizard.
 *
 * Credentials are persisted separately from providers so they survive
 * provider removal and can be reused when re-adding a provider of the
 * same type.
 *
 * **Security model:**
 * - Credentials include secrets (API keys, tokens) so they can be
 *   reused without re-entry. This is the expected UX for a wallet.
 * - chrome.storage.local is extension-private (not accessible to web
 *   pages or other extensions) and encrypted at rest by Chrome.
 * - Credential IDs use crypto.getRandomValues for unpredictability.
 * - String fields are length-capped on write.
 * - A hard cap prevents unbounded storage growth.
 * - The validator rejects malformed entries on read.
 *
 * Storage key: `byom.wallet.credentials.v1`
 */

const STORAGE_KEY = "byom.wallet.credentials.v1";
const MAX_CREDENTIALS = 50;
const MAX_NAME_LENGTH = 120;
const MAX_FIELD_VALUE_LENGTH = 2000;
const MAX_FIELDS_PER_CREDENTIAL = 20;

export type StoredCredential = {
    id: string;
    connectorId: string;
    name: string;
    /** Field values including secrets (API keys, tokens, URLs, etc.). */
    fields: Readonly<Record<string, string>>;
    createdAt: number;
    lastUsedAt: number;
};

function generateCredentialId(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `cred.${hex}`;
}

function sanitizeName(raw: string): string {
    return raw.trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Validate and cap field values.
 * Secrets (API keys, tokens) ARE stored — chrome.storage.local is
 * extension-private and encrypted at rest by Chrome.
 */
function sanitizeFields(raw: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    const out: Record<string, string> = {};
    let count = 0;
    for (const [key, value] of Object.entries(raw)) {
        if (count >= MAX_FIELDS_PER_CREDENTIAL) break;
        if (typeof key !== "string" || typeof value !== "string") continue;
        out[key] = value.slice(0, MAX_FIELD_VALUE_LENGTH);
        count++;
    }
    return out;
}

/** Load all stored credentials. */
export async function loadCredentials(): Promise<StoredCredential[]> {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const raw = result[STORAGE_KEY];
            if (!Array.isArray(raw)) {
                resolve([]);
                return;
            }
            const credentials: StoredCredential[] = [];
            for (const item of raw) {
                if (isValidCredential(item)) {
                    credentials.push(item);
                }
            }
            resolve(credentials);
        });
    });
}

/** Load credentials filtered by connector ID. */
export async function loadCredentialsForConnector(connectorId: string): Promise<StoredCredential[]> {
    const all = await loadCredentials();
    return all.filter((c) => c.connectorId === connectorId);
}

/** Save a new credential (or update an existing one by id). */
export async function saveCredential(
    connectorId: string,
    name: string,
    fields: Readonly<Record<string, string>>,
    existingId?: string | undefined,
): Promise<StoredCredential> {
    const all = await loadCredentials();
    const now = Date.now();
    const safeName = sanitizeName(name);
    const safeFields = sanitizeFields(fields);

    if (existingId !== undefined) {
        const idx = all.findIndex((c) => c.id === existingId);
        if (idx >= 0) {
            const updated: StoredCredential = {
                ...all[idx]!,
                name: safeName,
                fields: safeFields,
                lastUsedAt: now,
            };
            all[idx] = updated;
            await writeCredentials(all);
            return updated;
        }
    }

    // Enforce cap — evict the oldest unused credential if at limit
    if (all.length >= MAX_CREDENTIALS) {
        const oldest = all.reduce((a, b) => (a.lastUsedAt < b.lastUsedAt ? a : b));
        const idx = all.indexOf(oldest);
        if (idx >= 0) all.splice(idx, 1);
    }

    const credential: StoredCredential = {
        id: generateCredentialId(),
        connectorId: connectorId.slice(0, 100),
        name: safeName,
        fields: safeFields,
        createdAt: now,
        lastUsedAt: now,
    };
    all.push(credential);
    await writeCredentials(all);
    return credential;
}

/** Mark a credential as recently used. */
export async function touchCredential(credentialId: string): Promise<void> {
    const all = await loadCredentials();
    const idx = all.findIndex((c) => c.id === credentialId);
    if (idx >= 0) {
        all[idx] = { ...all[idx]!, lastUsedAt: Date.now() };
        await writeCredentials(all);
    }
}

/** Delete a credential by ID. */
export async function deleteCredential(credentialId: string): Promise<void> {
    const all = await loadCredentials();
    const filtered = all.filter((c) => c.id !== credentialId);
    await writeCredentials(filtered);
}

function writeCredentials(credentials: StoredCredential[]): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: credentials }, () => resolve());
    });
}

function isValidCredential(raw: unknown): raw is StoredCredential {
    if (typeof raw !== "object" || raw === null) return false;
    const obj = raw as Record<string, unknown>;
    if (
        typeof obj["id"] !== "string" ||
        typeof obj["connectorId"] !== "string" ||
        typeof obj["name"] !== "string" ||
        typeof obj["createdAt"] !== "number" ||
        typeof obj["lastUsedAt"] !== "number"
    ) {
        return false;
    }
    // Validate fields is a Record<string, string>
    if (typeof obj["fields"] !== "object" || obj["fields"] === null || Array.isArray(obj["fields"])) {
        return false;
    }
    const fields = obj["fields"] as Record<string, unknown>;
    for (const value of Object.values(fields)) {
        if (typeof value !== "string") return false;
    }
    return true;
}
