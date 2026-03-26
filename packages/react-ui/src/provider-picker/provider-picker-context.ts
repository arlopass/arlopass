"use client";

import { createComponentContext } from "../utils/create-context.js";
import type { ProviderDescriptor, BYOMSDKError } from "../types.js";

export type ProviderPickerContextValue = {
  providers: readonly ProviderDescriptor[];
  selectedProviderId: string | null;
  selectedModelId: string | null;
  isLoading: boolean;
  error: BYOMSDKError | null;
  models: readonly string[];
  setProviderId: (id: string) => void;
  setModelId: (id: string) => void;
  submit: () => void;
};

export const [ProviderPickerProvider, useProviderPickerContext] =
  createComponentContext<ProviderPickerContextValue>("ProviderPicker");
