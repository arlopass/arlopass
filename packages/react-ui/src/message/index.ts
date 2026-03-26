"use client";

import { Root } from "./message-root.js";
import { Content } from "./message-content.js";
import { Role } from "./message-role.js";
import { Timestamp } from "./message-timestamp.js";
import { Status } from "./message-status.js";
import { ToolCalls } from "./message-tool-calls.js";

export const Message = {
  Root,
  Content,
  Role,
  Timestamp,
  Status,
  ToolCalls,
} as const;
