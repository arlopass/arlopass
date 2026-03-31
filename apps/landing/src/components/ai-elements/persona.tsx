/**
 * Persona components — AI Elements-inspired avatar / persona for
 * message roles. Renders compact role-aware avatars.
 */
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type PersonaProps = HTMLAttributes<HTMLDivElement> & {
  role: "user" | "assistant";
};

const AssistantIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--ap-text-tertiary)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const UserIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--ap-text-tertiary)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export function Persona({ role, className, ...props }: PersonaProps) {
  return (
    <div
      className={cn(
        "w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
        role === "user"
          ? "bg-[var(--ap-bg-base)] border border-[var(--ap-border)]"
          : "bg-[var(--ap-brand-subtle,#2c1a0e)]",
        className,
      )}
      aria-hidden="true"
      {...props}
    >
      {role === "user" ? <UserIcon /> : <AssistantIcon />}
    </div>
  );
}
