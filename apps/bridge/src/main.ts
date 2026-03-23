import process from "node:process";
import { randomBytes } from "node:crypto";

import { BridgeHandler } from "./bridge-handler.js";
import { CopilotCliChatExecutor } from "./cli/copilot-chat-executor.js";
import { NativeHost } from "./native-host.js";

/**
 * Bridge entry point.
 *
 * Bootstraps the native messaging host and wires the BridgeHandler into the
 * message pipeline.  The shared secret used for the extension handshake is
 * read from the BYOM_BRIDGE_SHARED_SECRET environment variable (hex-encoded).
 * When the variable is absent a random ephemeral secret is generated; both
 * sides of the connection must agree on the secret through out-of-band
 * bootstrap (installation-time configuration).
 */
async function main(): Promise<void> {
  const secretEnv = process.env["BYOM_BRIDGE_SHARED_SECRET"];
  const sharedSecret =
    secretEnv !== undefined ? Buffer.from(secretEnv, "hex") : randomBytes(32);

  const cliChatExecutor = new CopilotCliChatExecutor();
  const probeTargets = [
    { cliType: "copilot-cli", label: "GitHub Copilot CLI" },
    { cliType: "claude-code", label: "Claude Code" },
  ] as const;
  for (const target of probeTargets) {
    try {
      await cliChatExecutor.probe(5_000, target.cliType);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[byom-bridge] warning: ${target.label} probe failed; that CLI path may be unavailable: ${errorMessage}\n`,
      );
    }
  }

  const bridgeHandler = new BridgeHandler({
    sharedSecret,
    cliChatExecutor,
  });

  const host = new NativeHost({
    input: process.stdin,
    output: process.stdout,
    handler: (message) => bridgeHandler.handle(message),
  });

  await host.run();
}

main().catch((error: unknown) => {
  process.stderr.write(`[byom-bridge] fatal: ${String(error)}\n`);
  process.exitCode = 1;
});
