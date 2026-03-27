"use client";

import { ProviderPicker } from "@arlopass/react-ui";

export type ArlopassProviderPickerProps = {
  /** Callback when a provider+model pair is confirmed */
  onSelect?: (providerId: string, modelId: string) => void;
  /** CSS class for the root element */
  className?: string;
};

export function ArlopassProviderPicker({
  onSelect,
  className,
}: ArlopassProviderPickerProps) {
  return (
    <ProviderPicker.Root
      onSelect={onSelect}
      className={`flex flex-wrap items-end gap-3 ${className ?? ""}`}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Provider
        </label>
        <ProviderPicker.ProviderSelect className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Model
        </label>
        <ProviderPicker.ModelSelect className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <ProviderPicker.SubmitButton className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        Apply
      </ProviderPicker.SubmitButton>
    </ProviderPicker.Root>
  );
}
