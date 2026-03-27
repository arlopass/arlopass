"use client";

import {
  useState,
  useMemo,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { useProviders } from "@arlopass/react";
import type { ProviderDescriptor, ArlopassSDKError } from "../types.js";
import { createForwardRef } from "../utils/forward-ref.js";
import {
  ProviderPickerProvider,
  type ProviderPickerContextValue,
} from "./provider-picker-context.js";

type ControlledProps = {
  providers: readonly ProviderDescriptor[];
  selectedProvider?: { providerId: string; modelId: string } | null;
  isLoading?: boolean;
  error?: ArlopassSDKError | null;
  onProviderChange?: (providerId: string) => void;
  onModelChange?: (modelId: string) => void;
  onSelect?: (providerId: string, modelId: string) => void;
};

type ProviderPickerRootProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> &
  Partial<ControlledProps> & {
    children: ReactNode;
  };

function getDataState(
  isLoading: boolean,
  error: ArlopassSDKError | null,
): string {
  if (error) return "error";
  if (isLoading) return "loading";
  return "ready";
}

export const Root = createForwardRef<HTMLDivElement, ProviderPickerRootProps>(
  "ProviderPicker.Root",
  (
    {
      providers: providersProp,
      selectedProvider: selectedProviderProp,
      isLoading: isLoadingProp,
      error: errorProp,
      onProviderChange,
      onModelChange,
      onSelect,
      children,
      ...rest
    },
    ref: Ref<HTMLDivElement>,
  ) => {
    const hook = useProviders();

    const isControlled = providersProp !== undefined;

    const providers = isControlled ? providersProp : hook.providers;
    const isLoading = isControlled ? (isLoadingProp ?? false) : hook.isLoading;
    const error = isControlled ? (errorProp ?? null) : hook.error;

    const [localProviderId, setLocalProviderId] = useState<string | null>(
      isControlled
        ? (selectedProviderProp?.providerId ?? null)
        : (hook.selectedProvider?.providerId ?? null),
    );
    const [localModelId, setLocalModelId] = useState<string | null>(
      isControlled
        ? (selectedProviderProp?.modelId ?? null)
        : (hook.selectedProvider?.modelId ?? null),
    );

    const selectedProviderId = localProviderId;
    const selectedModelId = localModelId;

    const models = useMemo(() => {
      if (!selectedProviderId) return [] as readonly string[];
      const provider = providers.find(
        (p) => p.providerId === selectedProviderId,
      );
      return provider?.models ?? ([] as readonly string[]);
    }, [providers, selectedProviderId]);

    const setProviderId = useCallback(
      (id: string) => {
        setLocalProviderId(id);
        setLocalModelId(null);
        onProviderChange?.(id);
      },
      [onProviderChange],
    );

    const setModelId = useCallback(
      (id: string) => {
        setLocalModelId(id);
        onModelChange?.(id);
      },
      [onModelChange],
    );

    const submit = useCallback(() => {
      if (!selectedProviderId || !selectedModelId) return;
      if (isControlled) {
        onSelect?.(selectedProviderId, selectedModelId);
      } else {
        void hook.selectProvider({
          providerId: selectedProviderId,
          modelId: selectedModelId,
        });
      }
    }, [selectedProviderId, selectedModelId, isControlled, onSelect, hook]);

    const contextValue = useMemo<ProviderPickerContextValue>(
      () => ({
        providers,
        selectedProviderId,
        selectedModelId,
        isLoading,
        error,
        models,
        setProviderId,
        setModelId,
        submit,
      }),
      [
        providers,
        selectedProviderId,
        selectedModelId,
        isLoading,
        error,
        models,
        setProviderId,
        setModelId,
        submit,
      ],
    );

    return (
      <div ref={ref} data-state={getDataState(isLoading, error)} {...rest}>
        <ProviderPickerProvider value={contextValue}>
          {children}
        </ProviderPickerProvider>
      </div>
    );
  },
);
