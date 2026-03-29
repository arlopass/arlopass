import { useState } from "react";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import { useTokenUsage } from "../hooks/useTokenUsage.js";
import type { OriginUsageSummary } from "../hooks/useTokenUsage.js";
import { MetadataDivider } from "./MetadataDivider.js";
import { staggerDelay } from "./animation-utils.js";

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function shortenOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return origin;
  }
}

function originInitial(origin: string): string {
  const hostname = shortenOrigin(origin);
  return hostname[0]?.toUpperCase() ?? "?";
}

function aggregateByModel(
  entries: { modelId: string; inputTokens: number; outputTokens: number }[],
): { modelId: string; inputTokens: number; outputTokens: number }[] {
  const map = new Map<
    string,
    { inputTokens: number; outputTokens: number }
  >();
  for (const e of entries) {
    const existing = map.get(e.modelId);
    if (existing) {
      existing.inputTokens += e.inputTokens;
      existing.outputTokens += e.outputTokens;
    } else {
      map.set(e.modelId, {
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
      });
    }
  }
  return Array.from(map.entries()).map(([modelId, data]) => ({
    modelId,
    ...data,
  }));
}

export function UsageTabContent() {
  const { summaries, loading, resetAll, resetOrigin } = useTokenUsage();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-[var(--ap-text-secondary)]/30 border-t-[var(--ap-text-secondary)] rounded-full animate-spin-slow" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 animate-fade-in">
        <span className="text-xs font-medium text-[var(--ap-text-primary)]">
          Token Usage
        </span>
        <span className="text-[10px] text-[var(--ap-text-secondary)] text-center max-w-[280px]">
          No token usage recorded yet. Usage will appear here as apps make AI
          requests through your wallet.
        </span>
      </div>
    );
  }

  const totalTokens = summaries.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
    0,
  );
  const totalRequests = summaries.reduce(
    (sum, s) => sum + s.totalRequestCount,
    0,
  );

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-2">
          {/* Summary bar */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-[var(--ap-text-primary)]">
                {formatTokenCount(totalTokens)} tokens
              </span>
              <MetadataDivider />
              <span className="text-[10px] font-medium text-[var(--ap-text-secondary)]">
                {totalRequests} {totalRequests === 1 ? "request" : "requests"}
              </span>
              <MetadataDivider />
              <span className="text-[10px] font-medium text-[var(--ap-text-secondary)]">
                {summaries.length} {summaries.length === 1 ? "app" : "apps"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void resetAll()}
              className="flex items-center justify-center w-5 h-5 rounded-sm bg-transparent border-none cursor-pointer text-[var(--ap-text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] transition-all duration-150 active:scale-90"
              title="Reset all usage"
            >
              <IconTrash size={11} />
            </button>
          </div>

          {/* Per-origin cards */}
          {summaries.map((summary, i) => (
            <UsageCard
              key={summary.origin}
              summary={summary}
              index={i}
              onReset={() => void resetOrigin(summary.origin)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function UsageCard({
  summary,
  index = 0,
  onReset,
}: {
  summary: OriginUsageSummary;
  index?: number;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;

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
          <div className="w-7 h-7 rounded-md bg-[var(--ap-brand-subtle)] flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-[var(--color-brand)]">
              {originInitial(summary.origin)}
            </span>
          </div>
          <div className="flex flex-col gap-0 overflow-hidden min-w-0">
            <span className="text-xs font-semibold text-[var(--ap-text-primary)] truncate">
              {shortenOrigin(summary.origin)}
            </span>
            <div className="flex items-center gap-2 overflow-hidden truncate">
              <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] whitespace-nowrap">
                {formatTokenCount(totalTokens)} tokens
              </span>
              <MetadataDivider />
              <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] whitespace-nowrap">
                {summary.totalRequestCount}{" "}
                {summary.totalRequestCount === 1 ? "request" : "requests"}
              </span>
            </div>
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
                  Input tokens
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {formatTokenCount(summary.totalInputTokens)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Output tokens
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {formatTokenCount(summary.totalOutputTokens)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Requests
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {summary.totalRequestCount}
                </span>
              </div>
              {summary.byProvider.length > 0 && (
                <>
                  <div className="h-px bg-[var(--ap-border)] my-0.5" />
                  <span className="text-[10px] font-semibold text-[var(--ap-text-primary)]">
                    By model
                  </span>
                  {aggregateByModel(summary.byProvider).map((m) => (
                    <div
                      key={m.modelId}
                      className="flex items-center justify-between"
                    >
                      <span className="text-[10px] text-[var(--ap-text-secondary)] truncate max-w-[160px]">
                        {m.modelId}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[var(--ap-text-secondary)] whitespace-nowrap">
                          ↑{formatTokenCount(m.inputTokens)}
                        </span>
                        <span className="text-[10px] text-[var(--ap-text-secondary)] whitespace-nowrap">
                          ↓{formatTokenCount(m.outputTokens)}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div className="h-px bg-[var(--ap-border)] my-0.5" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
                className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-[var(--color-danger)] hover:text-[var(--color-danger)] transition-all duration-150 p-0 self-start"
              >
                <IconTrash size={10} />
                <span className="text-[10px] font-medium">
                  Reset usage for this app
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
