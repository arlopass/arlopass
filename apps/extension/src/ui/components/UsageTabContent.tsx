import { IconTrash } from "@tabler/icons-react";
import { useTokenUsage } from "../hooks/useTokenUsage.js";

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
      <div className="flex items-center justify-center py-8 animate-fade-in">
        <span className="text-xs text-[var(--ap-text-secondary)] text-center">
          No token usage recorded yet.
        </span>
      </div>
    );
  }

  const totalTokens = summaries.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
    0,
  );

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[var(--ap-text-primary)]">
          Total: {formatTokenCount(totalTokens)} tokens
        </span>
        <button
          type="button"
          onClick={() => void resetAll()}
          className="flex items-center justify-center w-6 h-6 rounded-sm bg-transparent border-none cursor-pointer text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] transition-all duration-150 active:scale-90"
          title="Reset all usage"
        >
          <IconTrash size={12} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-1.5">
          {summaries.map((summary) => (
            <div
              key={summary.origin}
              className="bg-[var(--ap-bg-surface)] rounded-md px-2.5 py-2 animate-fade-in"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-[var(--ap-text-primary)] truncate max-w-[220px]">
                  {shortenOrigin(summary.origin)}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--ap-text-secondary)]">
                    {formatTokenCount(
                      summary.totalInputTokens + summary.totalOutputTokens,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void resetOrigin(summary.origin)}
                    className="flex items-center justify-center w-4 h-4 rounded-sm bg-transparent border-none cursor-pointer text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] transition-all duration-150"
                    title="Reset this app"
                  >
                    <IconTrash size={10} />
                  </button>
                </div>
              </div>

              {summary.byProvider.map((p) => (
                <div
                  key={`${p.providerId}-${p.modelId}`}
                  className="flex items-center justify-between pl-1.5"
                >
                  <span className="text-[10px] text-[var(--ap-text-secondary)] truncate max-w-[160px]">
                    {p.modelId}
                  </span>
                  <span className="text-[10px] text-[var(--ap-text-secondary)]">
                    ↑{formatTokenCount(p.inputTokens)} ↓
                    {formatTokenCount(p.outputTokens)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
