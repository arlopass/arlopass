"use client";

import { useRef, useEffect, useCallback } from "react";

export function useAutoScroll<E extends HTMLElement>(deps: readonly unknown[]) {
  const ref = useRef<E>(null);
  const rafRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, deps);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { ref, scrollToBottom };
}
