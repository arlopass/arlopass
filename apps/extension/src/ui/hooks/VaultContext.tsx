import { createContext, useContext, type ReactNode } from "react";

export type VaultContextValue = {
  sendVaultMessage: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({
  sendVaultMessage,
  children,
}: VaultContextValue & { children: ReactNode }) {
  return (
    <VaultContext.Provider value={{ sendVaultMessage }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVaultContext(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (ctx === null) {
    throw new Error("useVaultContext must be used inside a VaultProvider.");
  }
  return ctx;
}
