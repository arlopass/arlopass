/**
 * Conversation components — AI Elements-inspired wrappers for chat message
 * containers.  Modelled on the patterns from vercel/ai-elements but
 * implemented with our Arlopass design tokens so they work inside the
 * #arlopass-chat-panel island without requiring a full shadcn/ui setup.
 */
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./cn";

// ─── Conversation (scrollable root) ──────────────────────────────────

export type ConversationProps = HTMLAttributes<HTMLDivElement>;

export const Conversation = forwardRef<HTMLDivElement, ConversationProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative flex-1 overflow-y-auto", className)}
      role="log"
      aria-label="Chat conversation"
      {...props}
    />
  ),
);
Conversation.displayName = "Conversation";

// ─── Content (vertical stack of messages) ────────────────────────────

export type ConversationContentProps = HTMLAttributes<HTMLDivElement>;

export function ConversationContent({
  className,
  ...props
}: ConversationContentProps) {
  return (
    <div className={cn("flex flex-col gap-5 p-3.5", className)} {...props} />
  );
}

// ─── Empty State ─────────────────────────────────────────────────────

export type ConversationEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export function ConversationEmptyState({
  className,
  title = "No messages yet",
  description,
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon && <div className="text-[var(--ap-text-tertiary)]">{icon}</div>}
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-[var(--ap-text-body)]">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-[var(--ap-text-tertiary)] max-w-[220px]">
                {description}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
