import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { arlopassTheme } from "./ui/components/theme.js";
import { OptionsApp } from "./options/OptionsApp.js";
import { useVault } from "./ui/hooks/useVault.js";
import { VaultGate } from "./ui/components/VaultGate.js";
import { VaultProvider } from "./ui/hooks/VaultContext.js";
import { useColorScheme } from "./ui/hooks/useColorScheme.js";

function OptionsRoot() {
  const vault = useVault();
  const colorScheme = useColorScheme();
  return (
    <MantineProvider theme={arlopassTheme} forceColorScheme={colorScheme}>
      <VaultGate
        status={vault.status}
        onSetup={vault.setup}
        onSetupKeychain={vault.setupKeychain}
        onUnlock={vault.unlock}
        onUnlockKeychain={vault.unlockKeychain}
        onDestroyVault={vault.destroyVault}
        onRetry={vault.refresh}
        needsReauth={vault.needsReauth}
      >
        <VaultProvider sendVaultMessage={vault.sendVaultMessage}>
          <OptionsApp />
        </VaultProvider>
      </VaultGate>
    </MantineProvider>
  );
}

const root = document.getElementById("options-root");
if (root !== null) {
  createRoot(root).render(<OptionsRoot />);
}
