import { useCallback, useEffect, useState } from "react";
import { PasswordInput } from "@mantine/core";
import { IconChevronDown, IconKey, IconShieldLock } from "@tabler/icons-react";
import { ProviderAvatar } from "./ProviderAvatar.js";
import { PrimaryButton } from "./PrimaryButton.js";
import { useVaultContext } from "../hooks/VaultContext.js";
import { staggerDelay } from "./animation-utils.js";

type VaultCredential = {
  id: string;
  connectorId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
};

function deriveProviderKeyFromConnectorId(connectorId: string): string {
  if (connectorId === "cli-claude-code") return "claude";
  if (connectorId.includes("anthropic")) return "anthropic";
  if (connectorId.includes("openai")) return "openai";
  if (connectorId.includes("gemini")) return "gemini";
  if (connectorId.includes("foundry")) return "microsoft";
  if (connectorId.includes("bedrock")) return "bedrock";
  if (connectorId.includes("perplexity")) return "perplexity";
  if (connectorId.includes("vertex")) return "vertexai";
  if (connectorId.includes("ollama")) return "ollama";
  if (connectorId.includes("cli")) return "githubcopilot";
  return "openai";
}

function formatAge(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Last refreshed just now";
  if (mins < 60) return `Last refreshed ${String(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last refreshed ${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last refreshed ${String(days)}d ago`;
  if (days < 30)
    return `Last refreshed ${String(Math.floor(days / 7))} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `Last refreshed ${String(months)} month${months > 1 ? "s" : ""} ago`;
}

function formatSavedAge(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Saved just now";
  if (mins < 60) return `Saved ${String(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Saved ${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Saved ${String(days)}d ago`;
  if (days < 30)
    return `Saved ${String(Math.floor(days / 7))} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `Saved ${String(months)} month${months > 1 ? "s" : ""} ago`;
}

export function VaultTabContent() {
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyMode, setKeyMode] = useState<"password" | "keychain" | null>(null);
  const [minPasswordLength, setMinPasswordLength] = useState(8);
  const { sendVaultMessage } = useVaultContext();

  const reload = () =>
    void sendVaultMessage({ type: "vault.credentials.list" }).then((resp) =>
      setCredentials((resp.credentials ?? []) as VaultCredential[]),
    );

  useEffect(() => {
    void Promise.all([
      sendVaultMessage({ type: "vault.credentials.list" }),
      sendVaultMessage({ type: "vault.status" }),
    ]).then(([credResp, statusResp]) => {
      setCredentials((credResp.credentials ?? []) as VaultCredential[]);
      const mode = statusResp["keyMode"] as string | undefined;
      if (mode === "password" || mode === "keychain") {
        setKeyMode(mode);
      }
      const minPw = statusResp["minPasswordLength"];
      if (typeof minPw === "number" && minPw > 0) {
        setMinPasswordLength(minPw);
      }
      setLoading(false);
    });
  }, [sendVaultMessage]);

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[var(--ap-text-secondary)]">
              Loading…
            </span>
          </div>
        )}
        {!loading && (
          <div className="flex flex-col gap-3">
            <VaultSecuritySection
              keyMode={keyMode}
              minPasswordLength={minPasswordLength}
              sendVaultMessage={sendVaultMessage}
              onKeyModeChange={setKeyMode}
            />
            <div className="h-px bg-[var(--ap-border)]" />
            <span className="text-xs font-semibold text-[var(--ap-text-primary)]">
              Stored credentials
            </span>
            {credentials.length === 0 && (
              <span className="text-xs text-[var(--ap-text-secondary)] text-center py-4">
                No credentials stored. Add a provider to create credentials.
              </span>
            )}
            {credentials.map((cred, i) => (
              <CredentialCard
                key={cred.id}
                credential={cred}
                index={i}
                onDelete={(id) => {
                  void sendVaultMessage({
                    type: "vault.credentials.delete",
                    credentialId: id,
                  }).then(() => reload());
                }}
              />
            ))}
          </div>
        )}
      </div>
      <PrimaryButton>Manage credentials</PrimaryButton>
    </>
  );
}

// ---------------------------------------------------------------------------
// Vault Security Settings
// ---------------------------------------------------------------------------

function VaultSecuritySection({
  keyMode,
  minPasswordLength,
  sendVaultMessage,
  onKeyModeChange,
}: {
  keyMode: "password" | "keychain" | null;
  minPasswordLength: number;
  sendVaultMessage: (
    msg: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  onKeyModeChange: (mode: "password" | "keychain") => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === confirm;
  const tooShort = password.length > 0 && password.length < minPasswordLength;

  const handleSwitchToKeychain = useCallback(async () => {
    setSwitching(true);
    setError(null);
    try {
      const resp = await sendVaultMessage({ type: "vault.rekey.keychain" });
      if (resp["type"] === "error") {
        setError(
          (resp["message"] as string) ?? "Failed to switch to keychain.",
        );
      } else {
        onKeyModeChange("keychain");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Switch failed.");
    } finally {
      setSwitching(false);
    }
  }, [sendVaultMessage, onKeyModeChange]);

  const handleSwitchToPassword = useCallback(async () => {
    if (!passwordsMatch || tooShort) return;
    setSwitching(true);
    setError(null);
    try {
      const resp = await sendVaultMessage({ type: "vault.rekey", password });
      if (resp["type"] === "error") {
        setError(
          (resp["message"] as string) ?? "Failed to switch to password.",
        );
      } else {
        onKeyModeChange("password");
        setShowPasswordForm(false);
        setPassword("");
        setConfirm("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Switch failed.");
    } finally {
      setSwitching(false);
    }
  }, [sendVaultMessage, password, passwordsMatch, tooShort, onKeyModeChange]);

  return (
    <div className="bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-md p-3">
      <div className="flex items-center gap-2 mb-2">
        {keyMode === "password" ? (
          <IconShieldLock size={18} className="text-[var(--color-brand)]" />
        ) : (
          <IconKey size={18} className="text-[var(--color-brand)]" />
        )}
        <span className="text-xs font-semibold text-[var(--ap-text-primary)]">
          Vault security
        </span>
      </div>

      <p className="text-[10px] text-[var(--ap-text-secondary)] mb-2">
        {keyMode === "password"
          ? "Your vault is protected by a master password."
          : keyMode === "keychain"
            ? "Your vault is protected by the OS credential store. Unlocks automatically."
            : "Loading…"}
      </p>

      {error !== null && (
        <span className="text-[10px] text-[var(--color-danger)] block mb-2 animate-fade-in">
          {error}
        </span>
      )}

      {keyMode === "password" && !showPasswordForm && (
        <button
          type="button"
          onClick={handleSwitchToKeychain}
          disabled={switching}
          className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--ap-text-secondary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-sm cursor-pointer hover:text-[var(--ap-text-primary)] hover:border-[var(--ap-border-strong)] transition-all duration-150 active:scale-95 disabled:opacity-50"
        >
          {switching ? "Switching…" : "Switch to OS keychain"}
        </button>
      )}

      {keyMode === "keychain" && !showPasswordForm && (
        <button
          type="button"
          onClick={() => setShowPasswordForm(true)}
          className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--ap-text-secondary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-sm cursor-pointer hover:text-[var(--ap-text-primary)] hover:border-[var(--ap-border-strong)] transition-all duration-150 active:scale-95"
        >
          Switch to master password
        </button>
      )}

      {showPasswordForm && (
        <div className="flex flex-col gap-2 mt-2 animate-fade-in">
          <PasswordInput
            size="xs"
            label="New master password"
            placeholder={`At least ${String(minPasswordLength)} characters`}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={
              tooShort
                ? `Must be at least ${String(minPasswordLength)} characters`
                : undefined
            }
            styles={{
              label: {
                color: "var(--ap-text-body)",
                fontSize: 10,
                fontWeight: 500,
                marginBottom: 2,
              },
              input: {
                background: "var(--ap-bg-base)",
                borderColor: "var(--ap-border)",
                color: "var(--ap-text-primary)",
                fontSize: 11,
              },
            }}
          />
          <PasswordInput
            size="xs"
            label="Confirm password"
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            error={
              confirm.length > 0 && !passwordsMatch
                ? "Passwords don't match"
                : undefined
            }
            styles={{
              label: {
                color: "var(--ap-text-body)",
                fontSize: 10,
                fontWeight: 500,
                marginBottom: 2,
              },
              input: {
                background: "var(--ap-bg-base)",
                borderColor: "var(--ap-border)",
                color: "var(--ap-text-primary)",
                fontSize: 11,
              },
            }}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleSwitchToPassword}
              disabled={switching || !passwordsMatch || tooShort}
              className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--ap-text-primary)] bg-[var(--color-brand)] border-none rounded-sm cursor-pointer hover:bg-[var(--color-brand-hover)] transition-all duration-150 active:scale-95 disabled:opacity-40"
            >
              {switching ? "Setting…" : "Set password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPasswordForm(false);
                setPassword("");
                setConfirm("");
                setError(null);
              }}
              className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--ap-text-secondary)] bg-transparent border-none cursor-pointer hover:text-[var(--ap-text-primary)] transition-all duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CredentialCard({
  credential,
  index = 0,
  onDelete,
}: {
  credential: VaultCredential;
  index?: number;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const created = new Date(credential.createdAt).toLocaleDateString();
  return (
    <div
      className="w-full bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-md overflow-hidden transition-all duration-250 hover:border-[var(--ap-border-strong)] animate-fade-in-up"
      style={staggerDelay(index, 60)}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-transparent border-none cursor-pointer text-left gap-3"
      >
        <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
          <ProviderAvatar
            providerKey={deriveProviderKeyFromConnectorId(
              credential.connectorId,
            )}
            size={24}
          />
          <div className="flex flex-col justify-center overflow-hidden min-w-0">
            <span className="text-xs font-semibold text-[var(--ap-text-primary)] truncate leading-tight">
              {credential.name}
            </span>
            <span className="text-[10px] text-[var(--ap-text-tertiary)] truncate leading-tight">
              {formatSavedAge(credential.createdAt)}
            </span>
          </div>
        </div>
        {/* Green checkmark — matching SecureVault preview */}
        <div className="flex items-center gap-2 shrink-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-success)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <IconChevronDown
            size={16}
            className={`text-[var(--ap-text-secondary)] shrink-0 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
            aria-hidden
          />
        </div>
      </button>

      <div
        className={`grid transition-all duration-300 ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)" }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            <div className="h-px bg-[var(--ap-border)] mb-3" />
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Connector
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {credential.connectorId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Created
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {created}
                </span>
              </div>
              <div className="flex gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => onDelete(credential.id)}
                  className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--color-danger)] bg-[var(--color-danger-subtle)] border border-[var(--color-danger)]/20 rounded-sm cursor-pointer hover:bg-[var(--color-danger)] hover:text-[var(--ap-text-primary)] transition-all duration-150 active:scale-95"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
