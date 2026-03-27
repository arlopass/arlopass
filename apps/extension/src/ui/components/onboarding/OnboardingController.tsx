import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, Text, Loader, Box } from "@mantine/core";
import { tokens } from "../theme.js";
import {
  readSetupState,
  writeSetupState,
  markSetupComplete,
  detectBridge,
  type SetupStep,
  type OnboardingSetupState,
} from "./setup-state.js";
import { WelcomeStep } from "./WelcomeStep.js";
import { BridgeCheckStep } from "./BridgeCheckStep.js";
import { SuccessStep } from "./SuccessStep.js";

type OnboardingControllerProps = {
  onComplete: () => void;
  onOpenOptions: (route: string) => void;
  hasProviders: boolean;
};

export function OnboardingController({
  onComplete,
  onOpenOptions,
  hasProviders,
}: OnboardingControllerProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep | null>(null);
  const stateRef = useRef<OnboardingSetupState | null>(null);
  const mountedRef = useRef(true);

  const goToStep = useCallback((step: SetupStep) => {
    setCurrentStep(step);
    const current = stateRef.current;
    if (current) {
      const next = { ...current, currentStep: step };
      stateRef.current = next;
      void writeSetupState(next);
    }
  }, []);

  const handleComplete = useCallback(() => {
    void markSetupComplete().then(() => {
      if (mountedRef.current) onComplete();
    });
  }, [onComplete]);

  const checkStateAndRoute = useCallback(async () => {
    const state = await readSetupState();
    stateRef.current = state;

    if (state.completed) {
      onComplete();
      return;
    }

    if (hasProviders) {
      void markSetupComplete().then(() => onComplete());
      return;
    }

    const bridge = await detectBridge();

    if (bridge.connected && !hasProviders) {
      // Bridge found but no providers — send to options to add provider
      setCurrentStep(4);
      return;
    }

    if (bridge.connected) {
      setCurrentStep(2);
      return;
    }

    setCurrentStep(1);
  }, [onComplete, hasProviders]);

  // Initial mount check
  useEffect(() => {
    mountedRef.current = true;
    void checkStateAndRoute();
    return () => {
      mountedRef.current = false;
    };
  }, [checkStateAndRoute]);

  // Re-check when popup regains focus (user returns from options page)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void checkStateAndRoute();
      }
    };

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === "local") {
        void checkStateAndRoute();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [checkStateAndRoute]);

  // Step 4: open options and show placeholder
  useEffect(() => {
    if (currentStep === 4) {
      onOpenOptions("add-provider-onboarding");
    }
  }, [currentStep, onOpenOptions]);

  if (currentStep === null) {
    return (
      <Stack align="center" justify="center" h="100%" py={40}>
        <Loader size="sm" color={tokens.color.primary} />
      </Stack>
    );
  }

  if (currentStep === 1) {
    return <WelcomeStep onNext={() => goToStep(2)} />;
  }

  if (currentStep === 2) {
    return (
      <BridgeCheckStep
        onBridgeFound={() => goToStep(4)}
        onInstallNeeded={() => onOpenOptions("bridge-install")}
        onBack={() => goToStep(1)}
      />
    );
  }

  if (currentStep === 4) {
    return (
      <Stack align="center" justify="center" h="100%" py={40} gap={12}>
        <Loader size="sm" color={tokens.color.primary} />
        <Text size="sm" c={tokens.color.textSecondary}>
          Opening setup…
        </Text>
      </Stack>
    );
  }

  if (currentStep === 5) {
    return <SuccessStep onComplete={handleComplete} />;
  }

  // Step 3 is handled by options page; fallback loader
  return (
    <Box py={40}>
      <Loader size="sm" color={tokens.color.primary} />
    </Box>
  );
}
