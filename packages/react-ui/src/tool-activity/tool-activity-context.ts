"use client";

import { createComponentContext } from "../utils/create-context.js";

export type ToolActivityContextValue = {
  isActive: boolean;
};

export const [ToolActivityProvider, useToolActivityContext] =
  createComponentContext<ToolActivityContextValue>("ToolActivity");
