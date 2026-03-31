/**
 * Tool Activity components — AI Elements-inspired indicators for
 * tool execution phases (priming → matched → executing → result).
 */
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

// ─── Tool Activity (inline status for streaming tool use) ────────────

export type ToolActivityProps = HTMLAttributes<HTMLDivElement>;

export function ToolActivity({ className, ...props }: ToolActivityProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px] flex-wrap",
        className,
      )}
      {...props}
    />
  );
}

// ─── Tool Pill (badge for individual tools) ──────────────────────────

export type ToolPillProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "brand";
};

export function ToolPill({
  className,
  variant = "default",
  ...props
}: ToolPillProps) {
  return (
    <span
      className={cn(
        "inline-block text-[9px] font-medium px-1.5 py-px rounded",
        variant === "brand"
          ? "bg-[var(--ap-brand-subtle,#2c1a0e)] text-[var(--ap-brand,#db4d12)] font-semibold"
          : "bg-[var(--ap-bg-elevated)] text-[var(--ap-text-tertiary)]",
        className,
      )}
      {...props}
    />
  );
}

// ─── Bounce Dots (typing / working indicator) ────────────────────────

export function BounceDots({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-[3px]", className)}
      role="status"
      aria-label="Loading"
    >
      <span
        className="chat-bounce inline-block w-1 h-1 rounded-full bg-[var(--ap-brand,#db4d12)]"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="chat-bounce inline-block w-1 h-1 rounded-full bg-[var(--ap-brand,#db4d12)]"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="chat-bounce inline-block w-1 h-1 rounded-full bg-[var(--ap-brand,#db4d12)]"
        style={{ animationDelay: "300ms" }}
      />
    </span>
  );
}

// ─── Streaming Cursor ────────────────────────────────────────────────

export function StreamingCursor({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "chat-stream-cursor inline-block w-[2px] h-3.5 bg-[var(--ap-brand,#db4d12)] ml-0.5 align-middle",
        className,
      )}
    />
  );
}
