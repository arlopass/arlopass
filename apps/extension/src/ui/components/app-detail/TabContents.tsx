import { PrimaryButton } from "../PrimaryButton.js";
import { AppProviderCard } from "./AppProviderCard.js";
import { AppModelCard } from "./AppModelCard.js";
import type { ConnectedApp } from "../app-connect/app-storage.js";
import type { WalletProvider } from "../../popup-state.js";
import { deriveProviderKey } from "./utils.js";

type UsageSummary = {
  byProvider: {
    providerId: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
  }[];
};

export type ProvidersTabContentProps = {
  app: ConnectedApp;
  enabledProviders: WalletProvider[];
  appUsageSummary: UsageSummary | undefined;
  onDisableProvider: (providerId: string) => void;
  onEnableProvider: () => void;
};

export function ProvidersTabContent({
  app,
  enabledProviders,
  appUsageSummary,
  onDisableProvider,
  onEnableProvider,
}: ProvidersTabContentProps) {
  return (
    <>
      <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
        Enabled providers
      </span>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-2">
          {enabledProviders.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-[var(--ap-text-secondary)] text-center">
                No providers enabled for this app.
              </span>
            </div>
          )}
          {enabledProviders.map((p) => {
            const enabledModelCount = p.models.filter((m) =>
              app.enabledModelIds.includes(m.id),
            ).length;
            const providerUsage =
              appUsageSummary?.byProvider
                .filter((bp) => bp.providerId === p.id)
                .reduce(
                  (sum, bp) => sum + bp.inputTokens + bp.outputTokens,
                  0,
                ) ?? 0;
            return (
              <AppProviderCard
                key={p.id}
                provider={p}
                providerKey={deriveProviderKey(p)}
                enabledModelCount={enabledModelCount}
                totalModelCount={p.models.length}
                tokenUsage={providerUsage}
                onDisable={() => onDisableProvider(p.id)}
              />
            );
          })}
        </div>
      </div>
      <PrimaryButton onClick={onEnableProvider}>Enable provider</PrimaryButton>
    </>
  );
}

export type ModelsTabContentProps = {
  enabledModels: Map<
    string,
    { name: string; providerKey: string; providerCount: number }
  >;
  appUsageSummary: UsageSummary | undefined;
  onDisableModel: (modelId: string) => void;
  onEnableModel: () => void;
};

export function AppModelsTabContent({
  enabledModels,
  appUsageSummary,
  onDisableModel,
  onEnableModel,
}: ModelsTabContentProps) {
  return (
    <>
      <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
        Enabled models
      </span>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-2">
          {enabledModels.size === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-[var(--ap-text-secondary)] text-center">
                No models enabled for this app.
              </span>
            </div>
          )}
          {Array.from(enabledModels.entries()).map(([id, model]) => {
            const modelUsage =
              appUsageSummary?.byProvider
                .filter((bp) => bp.modelId === id)
                .reduce(
                  (sum, bp) => sum + bp.inputTokens + bp.outputTokens,
                  0,
                ) ?? 0;
            return (
              <AppModelCard
                key={id}
                modelId={id}
                model={model}
                tokenUsage={modelUsage}
                onDisable={() => onDisableModel(id)}
              />
            );
          })}
        </div>
      </div>
      <PrimaryButton onClick={onEnableModel}>Enable model</PrimaryButton>
    </>
  );
}
