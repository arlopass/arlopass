/**
 * Zero-fill a buffer in-place.
 * Uses .fill(0) which compiles to a memset on V8 Buffer internals.
 */
export function secureWipe(buffer: Buffer | Uint8Array): void {
    buffer.fill(0);
}
