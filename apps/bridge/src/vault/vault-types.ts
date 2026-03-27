// apps/bridge/src/vault/vault-types.ts

export type VaultCredential = {
  id: string;
  connectorId: string;
  name: string;
  fields: Record<string, string>;
  createdAt: string;
  lastUsedAt: string;
};

export type VaultProvider = {
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  connectorId: string;
  credentialId: string;
  metadata: Record<string, string>;
  models: string[];
  status: string;
  createdAt: string;
};

export type VaultAppConnection = {
  id: string;
  origin: string;
  displayName: string;
  approvedProviders: string[];
  approvedModels: string[];
  permissions: Record<string, unknown>;
  rules: Record<string, unknown>;
  limits: Record<string, unknown>;
  createdAt: string;
  lastUsedAt: string;
};

export type UsageEntry = {
  origin: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: string;
};

export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  lastUpdated: string;
};

export type VaultUsage = {
  recentEntries: UsageEntry[];
  totals: Record<string, UsageTotals>;
};

export type Vault = {
  version: 1;
  credentials: VaultCredential[];
  providers: VaultProvider[];
  appConnections: VaultAppConnection[];
  usage: VaultUsage;
};

export type VaultState = "uninitialized" | "locked" | "unlocked";

export type KeyMode = "password" | "keychain";

export type VaultErrorCode =
  | "vault.uninitialized"
  | "vault.locked"
  | "vault.locked_out"
  | "vault.corrupted"
  | "vault.write_failed"
  | "vault.inaccessible"
  | "vault.keychain_unavailable"
  | "vault.not_found"
  | "auth.invalid"
  | "request.invalid";

export class VaultError extends Error {
  readonly reasonCode: VaultErrorCode;
  constructor(message: string, reasonCode: VaultErrorCode) {
    super(message);
    this.name = "VaultError";
    this.reasonCode = reasonCode;
  }
}

export function createEmptyVault(): Vault {
  return {
    version: 1,
    credentials: [],
    providers: [],
    appConnections: [],
    usage: { recentEntries: [], totals: {} },
  };
}
