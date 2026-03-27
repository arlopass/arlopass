import { createHmac } from "node:crypto";

import type { BridgeHandler } from "../bridge-handler.js";
import type { NativeMessage } from "../native-host.js";

/**
 * Performs a full pairing-based handshake against the given BridgeHandler and
 * returns a valid session token that can be included in subsequent messages.
 *
 * 1. Sends `pairing.auto` to obtain a pairing handle + key.
 * 2. Sends `handshake.challenge` to get a nonce.
 * 3. Sends `handshake.verify` with the HMAC computed from the pairing key.
 */
export async function obtainSessionToken(
    handler: BridgeHandler,
    _sharedSecret?: Buffer,
    extensionId = "abcdefghijklmnopabcdefghijklmnop",
    hostName = "com.byom.bridge",
): Promise<string> {
    // Step 1: auto-pair
    const autoPairingResponse = await handler.handle({
        type: "pairing.auto",
        extensionId,
        hostName,
    } as NativeMessage);
    if (autoPairingResponse["type"] !== "pairing.auto") {
        throw new Error(
            `Auto-pairing failed: ${String(autoPairingResponse["type"])} — ${String(autoPairingResponse["message"] ?? "")}`,
        );
    }
    const pairingHandle = autoPairingResponse["pairingHandle"] as string;
    const pairingKeyHex = autoPairingResponse["pairingKeyHex"] as string;
    const pairingSecret = Buffer.from(pairingKeyHex, "hex");

    // Step 2: challenge
    const challengeResponse = await handler.handle({
        type: "handshake.challenge",
    } as NativeMessage);

    const nonce = challengeResponse["nonce"] as string;
    const hmac = createHmac("sha256", pairingSecret)
        .update(nonce)
        .digest("hex");

    // Step 3: verify with pairing
    const verifyResponse = await handler.handle({
        type: "handshake.verify",
        nonce,
        hmac,
        extensionId,
        hostName,
        pairingHandle,
    } as NativeMessage);

    if (verifyResponse["type"] !== "handshake.session") {
        throw new Error(
            `Handshake failed: ${String(verifyResponse["type"])} — ${String(verifyResponse["message"] ?? "")}`,
        );
    }

    return verifyResponse["sessionToken"] as string;
}
