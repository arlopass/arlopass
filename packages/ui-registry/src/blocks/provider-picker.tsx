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
        <label className="text-[10px] font-medium text-stone-500 dark:text-stone-400">
          Provider
        </label>
        <ProviderPicker.ProviderSelect className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-2.5 py-1.5 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-500" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-stone-500 dark:text-stone-400">
          Model
        </label>
        <ProviderPicker.ModelSelect className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-2.5 py-1.5 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-500" />
      </div>

      <ProviderPicker.SubmitButton className="rounded-lg bg-stone-800 dark:bg-stone-200 px-3.5 py-1.5 text-xs font-medium text-white dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        Apply
      </ProviderPicker.SubmitButton>
    </ProviderPicker.Root>
  );
}
