import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, Stack, Text, Loader, Button, Group, Box, Paper, Title } from "@mantine/core";
import "@mantine/core/styles.css";
import { IconArrowLeft } from "@tabler/icons-react";
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
        <Box style={{ minHeight: "100vh", background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Paper radius={8} p={40} style={{ textAlign: "center", maxWidth: 400 }}>
            <Text size="lg" fw={600} c={tokens.color.textPrimary}>
              Provider added!
            </Text>
            <Text size="sm" c={tokens.color.textSecondary} mt={8}>
              Heading back to the extension…
            </Text>
            <Loader size="sm" color={tokens.color.btnPrimaryBg} mt={16} />
          </Paper>
        </Box>
      );
    }

    return (
      <Box style={{ minHeight: "100vh", background: "#f3f3f3" }}>
        <OnboardingBanner
          step={2}
          totalSteps={3}
          label="Add a provider"
          bridgeConnected
        />
        <Box style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
          <Group justify="space-between" mb={16}>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconArrowLeft size={14} />}
              c={tokens.color.textSecondary}
              onClick={() => { window.location.hash = "bridge-install"; }}
            >
              Back
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

          <Paper radius={8} p={24} withBorder>
            <Title order={4} mb={16} c={tokens.color.textPrimary}>
              Connect your first AI provider
            </Title>
            <AddProviderWizard
              embedded
              onClose={() => { window.location.hash = "bridge-install"; }}
              onSaved={() => setProviderSaved(true)}
            />
          </Paper>
        </Box>
      </Box>
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
