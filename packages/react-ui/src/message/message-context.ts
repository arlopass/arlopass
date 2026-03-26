"use client";

import { createComponentContext } from "../utils/create-context.js";
import type { TrackedChatMessage } from "../types.js";

export type MessageContextValue = {
  message: TrackedChatMessage;
};

export const [MessageProvider, useMessageContext] =
  createComponentContext<MessageContextValue>("Message");
