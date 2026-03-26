"use client";

import { forwardRef, type Ref } from "react";

export function createForwardRef<E extends HTMLElement, P = object>(
  displayName: string,
  render: (props: P, ref: Ref<E>) => React.ReactNode,
) {
  const Component = forwardRef<E, P>(render as never);
  Component.displayName = displayName;
  return Component;
}
