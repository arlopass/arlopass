export type RevokeEvent = Readonly<{
  keyId: string;
  revokedAt: string;
  reason?: string;
}>;

export type InvalidationListener = (event: RevokeEvent) => void;

/**
 * Tracks revoked key IDs and invalidates any cached token material
 * immediately on revocation.
 *
 * Policy enforcement paths must check isRevoked() before trusting any
 * cached credential. A revoked key must never be used even if it
 * appears valid in a local cache.
 *
 * Listener errors are swallowed — invalidation must never be interrupted.
 */
export class RevokeInvalidator {
  readonly #revokedKeys = new Map<string, RevokeEvent>();
  readonly #listeners: InvalidationListener[] = [];

  /**
   * Subscribe to revocation events.
   * Returns a disposer function that removes the listener when called.
   */
  onInvalidation(listener: InvalidationListener): () => void {
    this.#listeners.push(listener);
    return () => {
      const index = this.#listeners.indexOf(listener);
      if (index !== -1) {
        this.#listeners.splice(index, 1);
      }
    };
  }

  /**
   * Mark a key as revoked and notify all registered listeners immediately.
   *
   * Subsequent calls to isRevoked() for this keyId will return true.
   * If the key was already revoked, this updates the record (idempotent-safe).
   */
  invalidate(event: RevokeEvent): void {
    this.#revokedKeys.set(event.keyId, event);
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not interrupt invalidation.
      }
    }
  }

  /** Returns true if the given key ID has been revoked. */
  isRevoked(keyId: string): boolean {
    return this.#revokedKeys.has(keyId);
  }

  /** Returns the revocation record for a revoked key, or undefined if not revoked. */
  getRevocationRecord(keyId: string): RevokeEvent | undefined {
    return this.#revokedKeys.get(keyId);
  }

  /** Returns all currently revoked key IDs sorted ascending. */
  listRevokedIds(): readonly string[] {
    return Object.freeze(Array.from(this.#revokedKeys.keys()).sort());
  }

  /** Clear all revocation records (e.g. on process restart with fresh state). */
  clear(): void {
    this.#revokedKeys.clear();
  }
}
