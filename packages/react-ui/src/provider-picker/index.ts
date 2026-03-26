"use client";

import { Root } from "./provider-picker-root.js";
import { ProviderSelect } from "./provider-picker-provider-select.js";
import { ModelSelect } from "./provider-picker-model-select.js";
import { SubmitButton } from "./provider-picker-submit-button.js";

export const ProviderPicker = {
  Root,
  ProviderSelect,
  ModelSelect,
  SubmitButton,
} as const;
