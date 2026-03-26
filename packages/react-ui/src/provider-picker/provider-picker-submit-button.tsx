"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useProviderPickerContext } from "./provider-picker-context.js";

type SubmitButtonProps = HTMLAttributes<HTMLButtonElement>;

export const SubmitButton = createForwardRef<HTMLButtonElement, SubmitButtonProps>(
  "ProviderPicker.SubmitButton",
  (props, ref: Ref<HTMLButtonElement>) => {
    const { selectedProviderId, selectedModelId, submit } =
      useProviderPickerContext("ProviderPicker.SubmitButton");

    const isDisabled = !selectedProviderId || !selectedModelId;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        onClick={submit}
        data-state={isDisabled ? "disabled" : "idle"}
        {...props}
      />
    );
  },
);
