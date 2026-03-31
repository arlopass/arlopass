/**
 * PromptInput components — AI Elements-inspired composable prompt input.
 * Provides a rich textarea with submit button using the Arlopass design
 * system.  Mirrors the compound-component patterns from
 * vercel/ai-elements/prompt-input.
 */
import {
  forwardRef,
  useCallback,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

// ─── PromptInput (form wrapper) ──────────────────────────────────────

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit"
> & {
  onSubmit: (text: string) => void;
  disabled?: boolean;
};

export const PromptInput = forwardRef<HTMLFormElement, PromptInputProps>(
  ({ className, onSubmit, disabled, children, ...props }, ref) => {
    const handleSubmit = useCallback(
      (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const text = (formData.get("message") as string)?.trim();
        if (text) {
          onSubmit(text);
        }
      },
      [onSubmit],
    );

    return (
      <form
        ref={ref}
        className={cn("w-full", className)}
        onSubmit={handleSubmit}
        {...props}
      >
        <fieldset
          disabled={disabled}
          className="flex items-end gap-2 rounded-xl border border-[var(--ap-border)] bg-[var(--ap-bg-base)] p-1.5 transition-colors focus-within:border-[var(--ap-brand)]"
        >
          {children}
        </fieldset>
      </form>
    );
  },
);
PromptInput.displayName = "PromptInput";

// ─── Textarea ────────────────────────────────────────────────────────

export type PromptInputTextareaProps =
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    onSubmitKeyDown?: () => void;
  };

export const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(
  (
    {
      className,
      placeholder = "Ask about Arlopass...",
      onSubmitKeyDown,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmitKeyDown?.();
          e.currentTarget.form?.requestSubmit();
        }
      },
      [onKeyDown, onSubmitKeyDown],
    );

    return (
      <textarea
        ref={ref}
        name="message"
        placeholder={placeholder}
        rows={1}
        className={cn(
          "flex-1 resize-none bg-transparent text-[12px] text-[var(--ap-text-body)]",
          "placeholder:text-[var(--ap-text-tertiary)] outline-none",
          "min-h-[32px] max-h-[120px] py-1.5 px-2 leading-[1.5]",
          "field-sizing-content",
          className,
        )}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  },
);
PromptInputTextarea.displayName = "PromptInputTextarea";

// ─── Submit button ───────────────────────────────────────────────────

export type PromptInputSubmitProps = HTMLAttributes<HTMLButtonElement> & {
  isStreaming?: boolean;
  disabled?: boolean;
};

export function PromptInputSubmit({
  className,
  isStreaming,
  disabled,
  ...props
}: PromptInputSubmitProps) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={isStreaming ? "Stop" : "Send message"}
      className={cn(
        "flex-shrink-0 inline-flex items-center justify-center",
        "w-7 h-7 rounded-lg transition-colors duration-150",
        "bg-[var(--ap-brand)] text-white",
        "hover:bg-[var(--ap-brand-hover,#c44210)]",
        "disabled:bg-[var(--ap-bg-elevated)] disabled:text-[var(--ap-text-tertiary)] disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ap-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ap-bg-base)]",
        className,
      )}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {isStreaming ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 2L11 13" />
          <path d="M22 2L15 22L11 13L2 9L22 2Z" />
        </svg>
      )}
    </button>
  );
}

// ─── Footer (provider/model selectors, context) ──────────────────────

export type PromptInputFooterProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputFooter({
  className,
  ...props
}: PromptInputFooterProps) {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props} />
  );
}
