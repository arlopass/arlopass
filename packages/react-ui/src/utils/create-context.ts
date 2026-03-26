"use client";

import { createContext, useContext } from "react";

export function createComponentContext<T>(componentName: string) {
  const Context = createContext<T | null>(null);
  Context.displayName = `${componentName}Context`;

  function useComponentContext(partName: string): T {
    const ctx = useContext(Context);
    if (ctx === null) {
      throw new Error(
        `<${partName}> must be used within <${componentName}.Root>.`,
      );
    }
    return ctx;
  }

  return [Context.Provider, useComponentContext] as const;
}
