/**
 * OS keychain-backed secret store for the bridge process.
 *
 * Abstracts over platform keychain access (macOS Keychain, Windows Credential
 * Manager, Linux libsecret). Fails safely: any lookup error results in
 * undefined — callers must treat undefined as a deny signal and must not
 * proceed with a missing secret.
 *
 * Production deployments supply a real KeychainBackend (e.g. via keytar).
 * The built-in InMemoryKeychainBackend is suitable for tests.
 */

export interface KeychainBackend {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export const KEYCHAIN_ERROR_CODES = {
  STORE_FAILED: "KEYCHAIN_STORE_FAILED",
  DELETE_FAILED: "KEYCHAIN_DELETE_FAILED",
} as const;

export type KeychainErrorCode =
  (typeof KEYCHAIN_ERROR_CODES)[keyof typeof KEYCHAIN_ERROR_CODES];

export class KeychainError extends Error {
  readonly code: KeychainErrorCode;

  constructor(
    message: string,
    code: KeychainErrorCode,
    options?: { cause?: Error },
  ) {
    super(message, options);
    this.name = "KeychainError";
    this.code = code;
  }
}

class InMemoryKeychainBackend implements KeychainBackend {
  readonly #store = new Map<string, string>();

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.#store.get(`${service}:${account}`) ?? null;
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.#store.set(`${service}:${account}`, password);
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.#store.delete(`${service}:${account}`);
  }
}

export class KeychainStore {
  readonly #backend: KeychainBackend;
  readonly #service: string;

  constructor(options: { service: string; backend?: KeychainBackend }) {
    this.#service = options.service;
    this.#backend = options.backend ?? new InMemoryKeychainBackend();
  }

  /**
   * Retrieve a secret by account key.
   *
   * Returns `undefined` on any failure including backend errors.
   * Callers must treat undefined as a deny signal — do not proceed
   * without the secret.
   */
  async retrieve(account: string): Promise<string | undefined> {
    try {
      const value = await this.#backend.getPassword(this.#service, account);
      return value ?? undefined;
    } catch {
      // Deny by default on keychain error.
      return undefined;
    }
  }

  /**
   * Store a secret under the given account key.
   * Throws KeychainError on backend failure.
   */
  async store(account: string, secret: string): Promise<void> {
    try {
      await this.#backend.setPassword(this.#service, account, secret);
    } catch (cause) {
      throw new KeychainError(
        `Failed to store secret for account "${account}".`,
        KEYCHAIN_ERROR_CODES.STORE_FAILED,
        cause instanceof Error ? { cause } : undefined,
      );
    }
  }

  /**
   * Delete a secret by account key.
   * Returns true if deleted, false on any failure (safe non-throw).
   */
  async delete(account: string): Promise<boolean> {
    try {
      return await this.#backend.deletePassword(this.#service, account);
    } catch {
      return false;
    }
  }
}
