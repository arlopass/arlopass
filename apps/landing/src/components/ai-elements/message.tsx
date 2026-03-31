/**
 * Message components — AI Elements-inspired components for rendering
 * chat messages.  Mirrors the composable API of vercel/ai-elements
 * (Message → MessageContent → MessageResponse) while using the Arlopass
 * design system.  Markdown is rendered via `marked` + `DOMPurify` which
 * are already in the project; this can be swapped for `streamdown` later
 * for enhanced streaming animations.
 */
import type { HTMLAttributes } from "react";
import { memo, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { cn } from "./cn";

marked.setOptions({ breaks: true, gfm: true });

// ─── Message (outer wrapper, role-aware) ─────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: MessageRole;
};

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        "chat-msg group flex w-full flex-col gap-1",
        from === "user"
          ? "is-user ml-auto max-w-[85%] items-end"
          : "is-assistant max-w-[95%]",
        className,
      )}
      data-role={from}
      {...props}
    />
  );
}

// ─── Content (bubble with role-based styling) ────────────────────────

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export function MessageContent({
  children,
  className,
  ...props
}: MessageContentProps) {
  return (
    <div
      className={cn(
        "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden",
        "text-[12px] leading-[1.65]",
        // User bubble
        "group-[.is-user]:ml-auto group-[.is-user]:rounded-xl",
        "group-[.is-user]:bg-[var(--ap-bg-base)] group-[.is-user]:border group-[.is-user]:border-[var(--ap-border)]",
        "group-[.is-user]:px-3 group-[.is-user]:py-2 group-[.is-user]:text-[var(--ap-text-body)]",
        // Assistant content
        "group-[.is-assistant]:text-[var(--ap-text-body)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── Response (renders markdown) ─────────────────────────────────────

export type MessageResponseProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children: string;
};

export const MessageResponse = memo(
  function MessageResponse({
    children,
    className,
    ...props
  }: MessageResponseProps) {
    const html = useMemo(() => {
      if (!children) return "";
      const raw = marked.parse(children, { async: false }) as string;
      return DOMPurify.sanitize(raw);
    }, [children]);

    return (
      <div
        className={cn("chat-markdown", className)}
        dangerouslySetInnerHTML={{ __html: html }}
        {...props}
      />
    );
  },
  (prev, next) => prev.children === next.children,
);

// ─── Actions (hover-visible action buttons) ──────────────────────────

export type MessageActionsProps = HTMLAttributes<HTMLDivElement>;

export function MessageActions({ className, ...props }: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export type MessageActionProps = HTMLAttributes<HTMLButtonElement> & {
  label: string;
};

export function MessageAction({
  className,
  label,
  children,
  ...props
}: MessageActionProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1",
        "text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-secondary)] hover:bg-[var(--ap-bg-elevated)]",
        "transition-colors duration-150",
        className,
      )}
      aria-label={label}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

// ─── Meta (provider/model attribution) ───────────────────────────────

export type MessageMetaProps = HTMLAttributes<HTMLDivElement>;

export function MessageMeta({ className, ...props }: MessageMetaProps) {
  return (
    <div
      className={cn(
        "text-[9px] text-[var(--ap-text-tertiary)] mt-0.5 ml-0.5 font-normal opacity-70",
        className,
      )}
      {...props}
    />
  );
}
