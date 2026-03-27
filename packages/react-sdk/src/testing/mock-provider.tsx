"use client";

import type { ReactNode } from "react";
import type { BYOMTransport } from "@byom-ai/web-sdk";
import { BYOMProvider } from "../provider/byom-provider.js";
import type { BYOMProviderProps } from "../types.js";
import { mockWindowByom } from "./window-mock.js";

type MockBYOMProviderProps = Omit<BYOMProviderProps, "appId"> & {
  appId?: string;
  transport: BYOMTransport;
  children: ReactNode;
};

/**
 * Test wrapper that injects a mock transport into `window.byom`
 * and wraps children with `<BYOMProvider>`.
 */
export function MockBYOMProvider({
  transport,
  appId = "test",
  children,
  ...rest
}: MockBYOMProviderProps): ReactNode {
  mockWindowByom(transport);
  return (
    <BYOMProvider appId={appId} {...rest}>
      {children}
    </BYOMProvider>
  );
}
