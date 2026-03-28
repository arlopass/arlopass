import { useCallback, useEffect, useState } from "react";
import type { ProviderModel, ProviderStatus } from "../connectors/types.js";

export type StoredProvider = {
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  status: ProviderStatus;
  models: readonly ProviderModel[];
  lastSyncedAt?: number;
  metadata?: Record<string, string>;
};

export type ActiveProviderRef = {
  providerId: string;
  modelId?: string;
};

const STORAGE_KEY_PROVIDERS = "arlopass.wallet.providers.v1";
const STORAGE_KEY_ACTIVE = "arlopass.wallet.activeProvider.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredProvider(value: unknown): StoredProvider | null {
  if (!isRecord(value)) return null;
  const id = typeof value["id"] === "string" ? value["id"] : "";
  const name = typeof value["name"] === "string" ? value["name"] : "";
  if (id.length === 0 || name.length === 0) return null;
  const type = value["type"] as StoredProvider["type"] | undefined;
  if (type !== "local" && type !== "cloud" && type !== "cli") return null;
  const models: ProviderModel[] = [];
  if (Array.isArray(value["models"])) {
    for (const m of value["models"]) {
      if (isRecord(m) && typeof m["id"] === "string" && typeof m["name"] === "string") {
        models.push({ id: m["id"], name: m["name"] });
      }
    }
  }
  return {
    id,
    name,
    type,
    status: (typeof value["status"] === "string" ? value["status"] : "disconnected") as ProviderStatus,
    models,
    ...(typeof value["lastSyncedAt"] === "number" ? { lastSyncedAt: value["lastSyncedAt"] } : {}),
    ...(isRecord(value["metadata"]) ? { metadata: value["metadata"] as Record<string, string> } : {}),
  };
}

function parseActiveProvider(value: unknown): ActiveProviderRef | null {
  if (!isRecord(value)) return null;
  const providerId = typeof value["providerId"] === "string" ? value["providerId"] : "";
  if (providerId.length === 0) return null;
  return {
    providerId,
    ...(typeof value["modelId"] === "string" ? { modelId: value["modelId"] } : {}),
  };
}

export function useProviderStorage() {
  const [providers, setProviders] = useState<StoredProvider[]>([]);
  const [activeProvider, setActiveProvider] = useState<ActiveProviderRef | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(() => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_PROVIDERS, STORAGE_KEY_ACTIVE], (raw) => {
        const rawProviders = raw[STORAGE_KEY_PROVIDERS];
        const parsed: StoredProvider[] = [];
        if (Array.isArray(rawProviders)) {
          for (const entry of rawProviders) {
            const p = parseStoredProvider(entry);
            if (p !== null) parsed.push(p);
          }
        }
        setProviders(parsed);
        setActiveProvider(parseActiveProvider(raw[STORAGE_KEY_ACTIVE]));
        setLoading(false);
        resolve();
      });
    });
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const writeState = useCallback(
    async (newProviders: StoredProvider[], newActive: ActiveProviderRef | null) => {
      return new Promise<void>((resolve, reject) => {
        chrome.storage.local.set(
          {
            [STORAGE_KEY_PROVIDERS]: newProviders,
            [STORAGE_KEY_ACTIVE]: newActive,
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            setProviders(newProviders);
            setActiveProvider(newActive);
            resolve();
          },
        );
      });
    },
    [],
  );

  const saveProvider = useCallback(
    async (provider: StoredProvider) => {
      const existing = providers.findIndex((p) => p.id === provider.id);
      const updated = [...providers];
      if (existing >= 0) {
        updated[existing] = provider;
      } else {
        updated.push(provider);
      }
      const active =
        activeProvider ?? { providerId: provider.id, ...(provider.models[0]?.id != null ? { modelId: provider.models[0].id } : {}) };
      await writeState(updated, active);
    },
    [providers, activeProvider, writeState],
  );

  const removeProvider = useCallback(
    async (providerId: string) => {
      const updated = providers.filter((p) => p.id !== providerId);
      const active =
        activeProvider?.providerId === providerId
          ? (updated.length > 0 ? { providerId: updated[0]!.id } : null)
          : activeProvider;
      await writeState(updated, active);
    },
    [providers, activeProvider, writeState],
  );

  const activateProvider = useCallback(
    async (providerId: string) => {
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;
      const ref: ActiveProviderRef = {
        providerId,
        ...(activeProvider?.providerId === providerId && activeProvider?.modelId != null
          ? { modelId: activeProvider.modelId }
          : provider.models[0]?.id != null
            ? { modelId: provider.models[0].id }
            : {}),
      };
      await writeState(providers, ref);
    },
    [providers, activeProvider, writeState],
  );

  const setActiveModel = useCallback(
    async (providerId: string, modelId: string) => {
      await writeState(providers, { providerId, modelId });
    },
    [providers, writeState],
  );

  const refresh = useCallback(() => void loadSnapshot(), [loadSnapshot]);

  return {
    providers,
    activeProvider,
    loading,
    saveProvider,
    removeProvider,
    activateProvider,
    setActiveModel,
    refresh,
  };
}
