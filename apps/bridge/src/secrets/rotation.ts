import {
  InMemoryPolicyKeyManager,
  type PolicyKeyRecord,
  type PolicyKeyRotateInput,
  type PolicyKeyCreateInput,
} from "@arlopass/policy";

export type KeyRotationEvent = Readonly<{
  previousKeyId: string;
  currentKeyId: string;
  rotatedAt: string;
}>;

export type KeyRotationListener = (event: KeyRotationEvent) => void;

/**
 * Manages policy key rotation for the bridge process.
 *
 * Wraps InMemoryPolicyKeyManager to track the active key ID and notify
 * listeners synchronously when a rotation occurs. Listener errors are
 * swallowed — rotation must never be interrupted by a listener failure.
 *
 * Policy-bound references (e.g. cached bundles signed with the old key)
 * must be refreshed after a rotation event.
 */
export class KeyRotationManager {
  readonly #keyManager: InMemoryPolicyKeyManager;
  readonly #listeners: KeyRotationListener[] = [];
  #activeKeyId: string | undefined;

  constructor(keyManager?: InMemoryPolicyKeyManager) {
    this.#keyManager = keyManager ?? new InMemoryPolicyKeyManager();
  }

  /** The ID of the currently active signing key, or undefined if no key is registered. */
  get activeKeyId(): string | undefined {
    return this.#activeKeyId;
  }

  /** Exposes the underlying key manager for use with policy evaluators. */
  get keyManager(): InMemoryPolicyKeyManager {
    return this.#keyManager;
  }

  /**
   * Register an active key without a prior key (initial setup).
   * Sets the active key ID to the created key.
   */
  createInitialKey(input: PolicyKeyCreateInput): PolicyKeyRecord {
    const record = this.#keyManager.createKey(input);
    this.#activeKeyId = record.keyId;
    return record;
  }

  /**
   * Rotate the current active key to a new key.
   *
   * The previous key is marked as rotated in the key manager. The new
   * key becomes active. All registered listeners are notified synchronously.
   */
  rotate(
    currentKeyId: string,
    input: PolicyKeyRotateInput,
  ): Readonly<{ previous: PolicyKeyRecord; current: PolicyKeyRecord }> {
    const result = this.#keyManager.rotateKey(currentKeyId, input);
    this.#activeKeyId = result.current.keyId;

    const event: KeyRotationEvent = {
      previousKeyId: result.previous.keyId,
      currentKeyId: result.current.keyId,
      rotatedAt: result.current.createdAt,
    };

    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not interrupt rotation.
      }
    }

    return result;
  }

  /**
   * Subscribe to key rotation events.
   * Returns a disposer function that removes the listener when called.
   */
  onRotation(listener: KeyRotationListener): () => void {
    this.#listeners.push(listener);
    return () => {
      const index = this.#listeners.indexOf(listener);
      if (index !== -1) {
        this.#listeners.splice(index, 1);
      }
    };
  }
}
