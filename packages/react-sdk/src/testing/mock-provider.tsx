"use client";

import type { ReactNode } from "react";
import type { ArlopassTransport } from "@arlopass/web-sdk";
import { ArlopassProvider } from "../provider/arlopass-provider.js";
import type { ArlopassProviderProps } from "../types.js";
import { mockWindowArlopass } from "./window-mock.js";

type MockArlopassProviderProps = Omit<ArlopassProviderProps, "appId"> & {
  appId?: string;
  transport: ArlopassTransport;
  children: ReactNode;
};

/**
 * Test wrapper that injects a mock transport into `window.arlopass`
 * and wraps children with `<ArlopassProvider>`.
 */
export function MockArlopassProvider({
  transport,
  appId = "test",
  children,
  ...rest
}: MockArlopassProviderProps): ReactNode {
  mockWindowArlopass(transport);
  return (
    <ArlopassProvider appId={appId} {...rest}>
      {children}
    </ArlopassProvider>
  );
}
