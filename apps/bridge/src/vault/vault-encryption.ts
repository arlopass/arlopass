// apps/bridge/src/vault/vault-encryption.ts
import {
    createCipheriv,
    createDecipheriv,
    pbkdf2Sync,
    randomBytes,
} from "node:crypto";
import type { Vault, KeyMode } from "./vault-types.js";
import { secureWipe } from "./secure-wipe.js";

/**
 * File header layout (64 bytes total):
 *   [0..3]   magic   "ARLO" (4 bytes)
 *   [4]      version  1 (1 byte)
 *   [5]      keyMode  0=password, 1=keychain (1 byte)
 *   [6..37]  salt     32 bytes (PBKDF2 salt, permanent)
 *   [38..49] iv       12 bytes (GCM nonce, fresh per write)
 *   [50..63] reserved 14 bytes (zeros)
 */
export const HEADER_SIZE = 64;
const MAGIC = Buffer.from("ARLO", "ascii");
const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;

const KEY_MODE_MAP: Record<KeyMode, number> = { password: 0, keychain: 1 };
const KEY_MODE_REVERSE: Record<number, KeyMode> = { 0: "password", 1: "keychain" };

export function deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

export function encryptVault(
    vault: Vault,
    key: Buffer,
    salt: Buffer,
    keyMode: KeyMode,
): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const plaintext = Buffer.from(JSON.stringify(vault), "utf8");

    const header = Buffer.alloc(HEADER_SIZE, 0);
    MAGIC.copy(header, 0);
    header[4] = 1; // version
    header[5] = KEY_MODE_MAP[keyMode];
    salt.copy(header, 6);
    iv.copy(header, 38);

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 16 bytes

    secureWipe(plaintext);

    return Buffer.concat([header, encrypted, authTag]);
}

export type ParsedHeader = {
    version: number;
    keyMode: KeyMode;
    salt: Buffer;
    iv: Buffer;
};

export function parseHeader(data: Buffer): ParsedHeader {
    if (data.length < HEADER_SIZE) {
        throw new Error("Vault file too small to contain a valid header.");
    }
    if (!data.subarray(0, 4).equals(MAGIC)) {
        throw new Error("Invalid vault file: bad magic bytes. Not an Arlopass vault.");
    }
    const version = data[4];
    if (version !== 1) {
        throw new Error(
            `Vault format version ${version} is not supported by this bridge. Please update.`,
        );
    }
    const keyModeByte = data[5];
    const keyMode = keyModeByte !== undefined ? KEY_MODE_REVERSE[keyModeByte] : undefined;
    if (keyMode === undefined) {
        throw new Error(`Unknown key mode: ${keyModeByte}`);
    }
    const salt = Buffer.from(data.subarray(6, 6 + SALT_LENGTH));
    const iv = Buffer.from(data.subarray(38, 38 + IV_LENGTH));
    return { version, keyMode, salt, iv };
}

export function decryptVault(data: Buffer, key: Buffer): Vault {
    const { iv } = parseHeader(data);

    const ciphertextAndTag = data.subarray(HEADER_SIZE);
    if (ciphertextAndTag.length < 16) {
        throw new Error("Vault file too small: no ciphertext.");
    }
    const authTag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
    const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const vault: Vault = JSON.parse(decrypted.toString("utf8"));

    secureWipe(decrypted);
    return vault;
}
