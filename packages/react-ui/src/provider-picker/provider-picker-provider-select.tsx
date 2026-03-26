"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useProviderPickerContext } from "./provider-picker-context.js";

type ProviderSelectProps = HTMLAttributes<HTMLSelectElement>;

export const ProviderSelect = createForwardRef<HTMLSelectElement, ProviderSelectProps>(
  "ProviderPicker.ProviderSelect",
  (props, ref: Ref<HTMLSelectElement>) => {
    const { providers, selectedProviderId, setProviderId } =
      useProviderPickerContext("ProviderPicker.ProviderSelect");

    return (
      <select
        ref={ref}
        value={selectedProviderId ?? ""}
        onChange={(e) => setProviderId(e.target.value)}
        data-state={selectedProviderId ? "selected" : "unselected"}
        {...props}
      >
        <option value="" disabled>
          Select provider
        </option>
        {providers.map((p) => (
          <option key={p.providerId} value={p.providerId}>
            {p.providerName}
          </option>
        ))}
      </select>
    );
  },
);
