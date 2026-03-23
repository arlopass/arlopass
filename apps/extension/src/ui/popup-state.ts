export type WalletProviderModel = {
  id: string;
  name: string;
};

export type WalletProvider = {
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  status: "connected" | "disconnected" | "attention";
  models: WalletProviderModel[];
  lastSyncedAt?: number;
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

const VALID_TYPES = new Set<string>(["local", "cloud", "cli"]);
const VALID_STATUSES = new Set<string>(["connected", "disconnected", "attention"]);

function isValidModel(m: unknown): m is WalletProviderModel {
  if (typeof m !== "object" || m === null) return false;
  const model = m as Record<string, unknown>;
  return typeof model["id"] === "string" && typeof model["name"] === "string";
}

function parseProvider(raw: unknown, warnings: string[]): WalletProvider | null {
  if (typeof raw !== "object" || raw === null) {
    warnings.push("Dropped provider: not an object");
    return null;
  }
  const p = raw as Record<string, unknown>;

  if (typeof p["id"] !== "string" || p["id"].length === 0) {
    warnings.push("Dropped provider: missing or invalid id");
    return null;
  }
  if (typeof p["name"] !== "string") {
    warnings.push(`Dropped provider ${String(p["id"])}: missing name`);
    return null;
  }
  if (!VALID_TYPES.has(p["type"] as string)) {
    warnings.push(`Dropped provider ${String(p["id"])}: invalid type "${String(p["type"])}"`);
    return null;
  }
  if (!VALID_STATUSES.has(p["status"] as string)) {
    warnings.push(`Dropped provider ${String(p["id"])}: invalid status "${String(p["status"])}"`);
    return null;
  }

  const rawModels = Array.isArray(p["models"]) ? p["models"] : [];
  const models: WalletProviderModel[] = [];
  for (const m of rawModels) {
    if (isValidModel(m)) {
      models.push({ id: m.id, name: m.name });
    } else {
      warnings.push(`Provider ${String(p["id"])}: dropped malformed model`);
    }
  }

  return {
    id: p["id"] as string,
    name: p["name"] as string,
    type: p["type"] as "local" | "cloud" | "cli",
    status: p["status"] as "connected" | "disconnected" | "attention",
    models,
    ...(typeof p["lastSyncedAt"] === "number" ? { lastSyncedAt: p["lastSyncedAt"] as number } : {}),
  };
}

function parseActiveProvider(raw: unknown): ActiveProviderRef | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a["providerId"] !== "string" || a["providerId"].length === 0) return null;
  return {
    providerId: a["providerId"] as string,
    ...(typeof a["modelId"] === "string" ? { modelId: a["modelId"] as string } : {}),
  };
}

function parseLastError(raw: unknown): WalletError | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (
    typeof e["code"] !== "string" ||
    typeof e["message"] !== "string" ||
    typeof e["at"] !== "number"
  ) {
    return null;
  }
  return {
    code: e["code"] as string,
    message: e["message"] as string,
    at: e["at"] as number,
  };
}

export function normalizeWalletSnapshot(raw: unknown): WalletSnapshot {
  const warnings: string[] = [];

  if (typeof raw !== "object" || raw === null) {
    warnings.push("Storage payload is not an object; using empty state");
    return { providers: [], activeProvider: null, lastError: null, warnings };
  }

  const data = raw as Record<string, unknown>;

  const rawProviders = data["byom.wallet.providers.v1"];
  const providers: WalletProvider[] = [];
  if (rawProviders !== undefined) {
    if (!Array.isArray(rawProviders)) {
      warnings.push("byom.wallet.providers.v1 is not an array; ignoring");
    } else {
      for (const p of rawProviders) {
        const parsed = parseProvider(p, warnings);
        if (parsed !== null) {
          providers.push(parsed);
        }
      }
    }
  }

  const activeProvider = parseActiveProvider(data["byom.wallet.activeProvider.v1"]);
  const lastError = parseLastError(data["byom.wallet.ui.lastError.v1"]);

  return { providers, activeProvider, lastError, warnings };
}
