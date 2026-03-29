"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { useConnection } from "@arlopass/react";
import type { ClientState } from "../types.js";
import { createForwardRef } from "../utils/forward-ref.js";

type ConnectionStatusProps = HTMLAttributes<HTMLDivElement> & {
  state?: ClientState;
  sessionId?: string;
  children?: ReactNode;
};

export const ConnectionStatus = createForwardRef<
  HTMLDivElement,
  ConnectionStatusProps
>(
  "ConnectionStatus",
  (
    { state: stateProp, sessionId: _sessionIdProp, children, ...rest }, // eslint-disable-line @typescript-eslint/no-unused-vars -- sessionId reserved for future controlled mode
    ref: Ref<HTMLDivElement>,
  ) => {
    const hook = useConnection();

    const isControlled = stateProp !== undefined;
    const state = isControlled ? stateProp : hook.state;

    return (
      <div ref={ref} data-state={state} {...rest}>
        {children ?? state}
      </div>
    );
  },
);
