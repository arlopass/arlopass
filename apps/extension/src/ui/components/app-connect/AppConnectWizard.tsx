import { useCallback, useEffect } from "react";
import { Box } from "@mantine/core";
import { PopupShell } from "../PopupShell.js";
import { WalletHeader } from "../WalletHeader.js";
import { ApproveStep } from "./ApproveStep.js";
import { SelectProvidersStep } from "./SelectProvidersStep.js";
import { SelectModelsStep } from "./SelectModelsStep.js";
import { ConfigureSettingsStep } from "./ConfigureSettingsStep.js";
import { saveApp } from "./app-storage.js";
import { appConnectReducer, createInitialState } from "./app-connect-state.js";
import { usePersistedReducer } from "../../hooks/usePersistedReducer.js";
import type { ProviderCardData } from "../ProviderCard.js";
import type { WalletProvider } from "../../popup-state.js";
import { useVaultContext } from "../../hooks/VaultContext.js";
import { tokens } from "../theme.js";

export type AppConnectWizardProps = {
  origin: string;
  providers: ProviderCardData[];
  rawProviders: WalletProvider[];
  onComplete: (approved: boolean) => void;
};

export function AppConnectWizard({
  origin,
  providers,
  rawProviders,
  onComplete,
}: AppConnectWizardProps) {
  const { sendVaultMessage } = useVaultContext();
  const [state, dispatch] = usePersistedReducer(
    "arlopass.popup.appConnect.v1",
    appConnectReducer,
    createInitialState(origin),
  );

  const clearPersistedState = useCallback(() => {
    try {
      chrome.storage.session.remove(["arlopass.popup.appConnect.v1"]);
    } catch {
      /* ignore */
    }
  }, []);

  // When entering model selection, pre-select all models from enabled providers
  useEffect(() => {
    if (state.step === "select-models" && state.enabledModelIds.length === 0) {
      const modelIds: string[] = [];
      for (const p of rawProviders) {
        if (state.enabledProviderIds.includes(p.id)) {
          for (const m of p.models) {
            if (!modelIds.includes(m.id)) modelIds.push(m.id);
          }
        }
      }
      dispatch({ type: "SET_MODELS", modelIds });
    }
  }, [
    state.step,
    state.enabledProviderIds,
    state.enabledModelIds.length,
    rawProviders,
  ]);

  const handleBack = useCallback(() => {
    if (state.step === "approve") {
      clearPersistedState();
      onComplete(false);
    } else {
      dispatch({ type: "GO_BACK" });
    }
  }, [state.step, onComplete, clearPersistedState]);

  const handleSave = useCallback(async () => {
    dispatch({ type: "START_SAVE" });
    await saveApp(
      {
        origin: state.origin,
        displayName: state.displayName,
        enabledProviderIds: state.enabledProviderIds,
        enabledModelIds: state.enabledModelIds,
        permissions: state.permissions,
        rules: state.rules,
        limits: state.limits,
        status: "active",
      },
      sendVaultMessage,
    );
    dispatch({ type: "SAVE_COMPLETE" });
    clearPersistedState();
    onComplete(true);
  }, [state, onComplete, clearPersistedState, sendVaultMessage]);

  return (
    <PopupShell>
      <WalletHeader
        title={
          state.step === "approve"
            ? "Connection request"
            : `Connect ${state.displayName}`
        }
        onToggleCollapse={handleBack}
        onSettingsClick={() => onComplete(false)}
      />
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: tokens.spacing.contentHPadding,
          paddingTop: tokens.spacing.contentTopPadding,
          paddingBottom: tokens.spacing.contentBottomPadding,
          gap: tokens.spacing.sectionGap,
        }}
      >
        {state.step === "approve" && (
          <ApproveStep
            origin={state.origin}
            displayName={state.displayName}
            onApprove={() => dispatch({ type: "APPROVE" })}
            onDecline={() => onComplete(false)}
          />
        )}

        {state.step === "select-providers" && (
          <SelectProvidersStep
            providers={providers}
            selectedIds={state.enabledProviderIds}
            onToggle={(ids) =>
              dispatch({ type: "SET_PROVIDERS", providerIds: ids })
            }
            onNext={() => dispatch({ type: "GO_TO_MODELS" })}
          />
        )}

        {state.step === "select-models" && (
          <SelectModelsStep
            rawProviders={rawProviders}
            selectedProviderIds={state.enabledProviderIds}
            selectedModelIds={state.enabledModelIds}
            onToggle={(ids) => dispatch({ type: "SET_MODELS", modelIds: ids })}
            onNext={() => dispatch({ type: "GO_TO_SETTINGS" })}
          />
        )}

        {state.step === "configure-settings" && (
          <ConfigureSettingsStep
            rules={state.rules}
            permissions={state.permissions}
            limits={state.limits}
            onRuleChange={(key, value) =>
              dispatch({ type: "SET_RULE", key, value })
            }
            onPermissionChange={(key, value) =>
              dispatch({ type: "SET_PERMISSION", key, value })
            }
            onLimitChange={(key, value) =>
              dispatch({ type: "SET_LIMIT", key, value })
            }
            onSave={() => void handleSave()}
            saving={state.saving}
          />
        )}
      </Box>
    </PopupShell>
  );
}
