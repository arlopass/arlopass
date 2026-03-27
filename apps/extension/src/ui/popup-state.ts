export type WalletProviderModel = {
  id: string;
  name: string;
};

export type WalletProvider = {
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  status:
  | "connected"
  | "disconnected"
  | "attention"
  | "reconnecting"
  | "failed"
  | "revoked"
  | "degraded";
  models: WalletProviderModel[];
  lastSyncedAt?: number;
  statusDetail?: string;
  metadata?: Readonly<Record<string, string>>;
};

export type ActiveProviderRef = {
  providerId: string;
  modelId?: string;
};

export type WalletError = {
  code: string;
  message: string;
  at: number;
};

export type WalletSnapshot = {
  providers: WalletProvider[];
  activeProvider: ActiveProviderRef | null;
  lastError: WalletError | null;
  warnings: string[];
};
