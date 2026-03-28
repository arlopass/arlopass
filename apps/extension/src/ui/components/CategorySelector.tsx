import { IconChevronDown } from "@tabler/icons-react";

export type CategorySelectorProps = {
  label: string;
  onClick?: (() => void) | undefined;
};

export function CategorySelector({ label, onClick }: CategorySelectorProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="listbox"
      aria-label={`Filter: ${label}`}
      className="flex items-center gap-1 bg-transparent border-none cursor-pointer p-0 group"
    >
      <span className="text-xs font-medium text-[var(--ap-text-primary)] whitespace-nowrap leading-normal">
        {label}
      </span>
      <IconChevronDown
        size={12}
        className="text-[var(--ap-text-primary)]"
        aria-hidden
      />
    </button>
  );
}
