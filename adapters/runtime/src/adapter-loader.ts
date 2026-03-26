import { type ProtocolCapability } from "@byom-ai/protocol";

import {
  AdapterLoaderError,
  RUNTIME_ERROR_CODES,
  SignatureVerificationError,
} from "./errors.js";
import { verifyArtifactSignature, type ArtifactKeyResolver, type SignedArtifact } from "./artifact-signature.js";
import { parseAdapterManifest, type AdapterManifest } from "./manifest-schema.js";
import { validateCloudAdapterContractV2Strict } from "./cloud-contract.js";

export interface AdapterContract {
  readonly manifest: AdapterManifest;
  describeCapabilities(): readonly ProtocolCapability[];
  listModels(): Promise<readonly string[]>;
  createSession(options?: Readonly<Record<string, unknown>>): Promise<string>;
  sendMessage(sessionId: string, message: string): Promise<string>;
  streamMessage(
    sessionId: string,
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<void>;
  healthCheck(): Promise<boolean>;
  shutdown(): Promise<void>;
}

export type AdapterLoadOptions = Readonly<{
  requireSignatureVerification?: boolean;
  keyResolver?: ArtifactKeyResolver;
  signedArtifact?: SignedArtifact;
}>;

export type LoadedAdapter = Readonly<{
  providerId: string;
  manifest: AdapterManifest;
  contract: AdapterContract;
}>;

function loaderError(
  message: string,
  code: (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES],
  details?: Readonly<Record<string, string | number | boolean | null>>,
  cause?: Error,
): AdapterLoaderError {
  return new AdapterLoaderError(message, {
    code,
    ...(details !== undefined ? { details } : {}),
    ...(cause !== undefined ? { cause } : {}),
  });
}

function isAdapterContract(value: unknown): value is AdapterContract {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["describeCapabilities"] === "function" &&
    typeof obj["listModels"] === "function" &&
    typeof obj["createSession"] === "function" &&
    typeof obj["sendMessage"] === "function" &&
    typeof obj["streamMessage"] === "function" &&
    typeof obj["healthCheck"] === "function" &&
    typeof obj["shutdown"] === "function" &&
    obj["manifest"] !== undefined
  );
}

export async function loadAdapter(
  manifestInput: unknown,
  factory: () => unknown | Promise<unknown>,
  options: AdapterLoadOptions = {},
): Promise<LoadedAdapter> {
  const manifest = parseAdapterManifest(manifestInput);

  const requireSignature = options.requireSignatureVerification ?? true;
  if (requireSignature) {
    if (options.signedArtifact === undefined) {
      throw loaderError(
        `Adapter "${manifest.providerId}" requires a signed artifact for activation.`,
        RUNTIME_ERROR_CODES.LOADER_SIGNATURE_REQUIRED,
        { providerId: manifest.providerId },
      );
    }
    if (options.keyResolver === undefined) {
      throw loaderError(
        `A key resolver is required to verify the signed artifact for adapter "${manifest.providerId}".`,
        RUNTIME_ERROR_CODES.LOADER_SIGNATURE_REQUIRED,
        { providerId: manifest.providerId },
      );
    }
    try {
      verifyArtifactSignature(options.signedArtifact, { keyResolver: options.keyResolver });
    } catch (error) {
      if (error instanceof SignatureVerificationError) {
        throw loaderError(
          `Artifact signature verification failed for adapter "${manifest.providerId}": ${error.message}`,
          RUNTIME_ERROR_CODES.LOADER_SIGNATURE_REQUIRED,
          { providerId: manifest.providerId },
          error,
        );
      }
      const cause = error instanceof Error ? error : undefined;
      throw loaderError(
        `Artifact signature verification failed for adapter "${manifest.providerId}".`,
        RUNTIME_ERROR_CODES.LOADER_SIGNATURE_REQUIRED,
        { providerId: manifest.providerId },
        cause,
      );
    }
  }

  let contractInstance: unknown;
  try {
    contractInstance = await Promise.resolve(factory());
  } catch (error) {
    const cause = error instanceof Error ? error : undefined;
    throw loaderError(
      `Failed to instantiate adapter "${manifest.providerId}".`,
      RUNTIME_ERROR_CODES.LOADER_IMPORT_FAILED,
      { providerId: manifest.providerId },
      cause,
    );
  }

  if (!isAdapterContract(contractInstance)) {
    throw loaderError(
      `Adapter "${manifest.providerId}" does not implement the required AdapterContract interface.`,
      RUNTIME_ERROR_CODES.LOADER_CONTRACT_VIOLATION,
      { providerId: manifest.providerId },
    );
  }

  if (manifest.connectionMethods !== undefined && manifest.connectionMethods.length > 0) {
    const validation = validateCloudAdapterContractV2Strict(contractInstance, {
      expectedConnectionMethods: manifest.connectionMethods,
    });
    if (!validation.ok) {
      const details: Record<string, string | number | boolean | null> = {
        providerId: manifest.providerId,
        requiredContract: "CloudAdapterContractV2",
        connectionMethodCount: manifest.connectionMethods.length,
        ...(validation.details ?? {}),
      };
      throw loaderError(
        `Adapter "${manifest.providerId}" declares "connectionMethods" but fails CloudAdapterContractV2 strict validation: ${validation.message}`,
        RUNTIME_ERROR_CODES.LOADER_CONTRACT_VIOLATION,
        details,
        validation.cause,
      );
    }
  }

  return Object.freeze({
    providerId: manifest.providerId,
    manifest,
    contract: contractInstance,
  });
}
