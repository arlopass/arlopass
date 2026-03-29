import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { ModelAvatar } from "../ModelAvatar.js";
import { formatTokens } from "./utils.js";

export type AppModelCardProps = {
  modelId: string;
  model: { name: string; providerKey: string; providerCount: number };
  tokenUsage?: number | undefined;
  onDisable: () => void;
};

export function AppModelCard({
  modelId,
  model,
  tokenUsage,
  onDisable,
}: AppModelCardProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="w-full bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-md overflow-hidden transition-all duration-250 hover:border-[var(--ap-border-strong)] animate-fade-in-up">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-transparent border-none cursor-pointer text-left gap-3"
      >
        <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
          <ModelAvatar
            modelId={modelId}
            providerKey={model.providerKey}
            size={24}
          />
          <div className="flex flex-col gap-0 overflow-hidden min-w-0">
            <span className="text-xs font-semibold text-[var(--ap-text-primary)] leading-normal truncate">
              {model.name}
            </span>
            <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] truncate">
              {model.providerCount}{" "}
              {model.providerCount === 1 ? "provider" : "providers"}
            </span>
          </div>
        </div>
        <IconChevronDown
          size={16}
          className={`text-[var(--ap-text-secondary)] shrink-0 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
          aria-hidden
        />
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
                  Model ID
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)] truncate max-w-[180px]">
                  {modelId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Providers
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {model.providerCount}
                </span>
              </div>
              {tokenUsage != null && tokenUsage > 0 && (
                <div className="flex justify-between">
                  <span className="text-[10px] text-[var(--ap-text-secondary)]">
                    Token usage
                  </span>
                  <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                    {formatTokens(tokenUsage)}
                  </span>
                </div>
              )}
              <div className="flex gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={onDisable}
                  className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--color-danger)] bg-[var(--color-danger-subtle)] border border-[var(--color-danger)]/20 rounded-sm cursor-pointer hover:bg-[var(--color-danger)] hover:text-[var(--ap-text-primary)] transition-all duration-150 active:scale-95"
                >
                  Disable
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
