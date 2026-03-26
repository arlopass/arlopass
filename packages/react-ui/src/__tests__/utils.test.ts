"use client";

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { createComponentContext } from "../utils/create-context.js";
import { createForwardRef } from "../utils/forward-ref.js";

describe("createComponentContext", () => {
  it("throws when used outside the provider", () => {
    const [, useCtx] = createComponentContext<{ value: number }>("Test");
    expect(() => {
      renderHook(() => useCtx("Child"));
    }).toThrow("<Child> must be used within <Test.Root>.");
  });

  it("returns context value inside the provider", () => {
    const [Provider, useCtx] = createComponentContext<{ value: number }>("Test");
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { value: { value: 42 } }, children);
    const { result } = renderHook(() => useCtx("Child"), { wrapper });
    expect(result.current.value).toBe(42);
  });
});

describe("createForwardRef", () => {
  it("sets displayName on the component", () => {
    const Component = createForwardRef<HTMLDivElement>("MyComponent", (props, ref) =>
      createElement("div", { ref, ...props }),
    );
    expect(Component.displayName).toBe("MyComponent");
  });
});
