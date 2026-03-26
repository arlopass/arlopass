"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useProviderPickerContext } from "./provider-picker-context.js";

type ModelSelectProps = HTMLAttributes<HTMLSelectElement>;

export const ModelSelect = createForwardRef<HTMLSelectElement, ModelSelectProps>(
  "ProviderPicker.ModelSelect",
  (props, ref: Ref<HTMLSelectElement>) => {
    const { models, selectedModelId, setModelId } =
      useProviderPickerContext("ProviderPicker.ModelSelect");

    return (
      <select
        ref={ref}
        value={selectedModelId ?? ""}
        onChange={(e) => setModelId(e.target.value)}
        data-state={selectedModelId ? "selected" : "unselected"}
        {...props}
      >
        <option value="" disabled>
          Select model
        </option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    );
  },
);
