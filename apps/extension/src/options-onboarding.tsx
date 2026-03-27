import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, Stack, Text, Loader, Button, Group } from "@mantine/core";
import "@mantine/core/styles.css";
import { byomTheme } from "./ui/components/theme.js";
import { BridgeInstallGuide } from "./ui/components/onboarding/BridgeInstallGuide.js";
import { OnboardingBanner } from "./ui/components/onboarding/OnboardingBanner.js";
import { AddProviderWizard } from "./ui/components/onboarding/AddProviderWizard.js";
import { tokens } from "./ui/components/theme.js";

type OnboardingRoute = "bridge-install" | "add-provider-onboarding" | null;

function parseHash(): OnboardingRoute {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "bridge-install") return "bridge-install";
  if (hash === "add-provider-onboarding") return "add-provider-onboarding";
  return null;
}

function OptionsOnboarding() {
  const [route, setRoute] = useState<OnboardingRoute>(parseHash);
  const [providerSaved, setProviderSaved] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Close the tab after provider is saved
  useEffect(() => {
    if (!providerSaved) return;
    const timer = setTimeout(() => window.close(), 2000);
    return () => clearTimeout(timer);
  }, [providerSaved]);

  if (route === null) return null;

  if (route === "bridge-install") {
    return (
      <BridgeInstallGuide
        onBridgeDetected={() => {
          window.location.hash = "add-provider-onboarding";
        }}
        onBack={() => window.close()}
      />
    );
  }

  if (route === "add-provider-onboarding") {
    if (providerSaved) {
      return (
        <Stack align="center" justify="center" py={40} gap={12}>
          <Text size="lg" fw={600} c={tokens.color.textPrimary}>
            Provider added!
          </Text>
          <Text size="sm" c={tokens.color.textSecondary}>
            Heading back…
          </Text>
          <Loader size="sm" color={tokens.color.btnPrimaryBg} />
        </Stack>
      );
    }

    return (
      <Stack gap={0}>
        <OnboardingBanner
          step={2}
          totalSteps={3}
          label="Add a provider"
          bridgeConnected
        />
        <Group justify="space-between" px={16} py={8}>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => { window.location.hash = "bridge-install"; }}
          >
            ← Back
          </Button>
          <Button
            variant="subtle"
            size="xs"
            c={tokens.color.textSecondary}
            onClick={() => window.close()}
          >
            Skip for now
          </Button>
        </Group>
        <AddProviderWizard
          onClose={() => window.close()}
          onSaved={() => setProviderSaved(true)}
        />
      </Stack>
    );
  }

  return null;
}

// Bootstrap: only mount if hash matches an onboarding route
const route = parseHash();
if (route !== null) {
  // Hide legacy options UI
  const legacyPage = document.querySelector(".options-page") as HTMLElement | null;
  if (legacyPage) legacyPage.style.display = "none";

  let mountEl = document.getElementById("onboarding-root");
  if (!mountEl) {
    mountEl = document.createElement("div");
    mountEl.id = "onboarding-root";
    document.body.prepend(mountEl);
  }

  createRoot(mountEl).render(
    <MantineProvider theme={byomTheme} forceColorScheme="light">
      <OptionsOnboarding />
    </MantineProvider>,
  );
}
