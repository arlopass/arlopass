"use client";

import { useRef, useEffect, useCallback } from "react";

/**
 * Auto-scrolls an element to the bottom.
 * When `isStreaming` is true, maintains a rAF loop that pins to bottom every
 * frame — ensures streaming content stays visible even during fast updates.
 * When not streaming, scrolls on dependency changes only.
 */
export function useAutoScroll<E extends HTMLElement>(
  deps: readonly unknown[],
  isStreaming = false,
) {
  const ref = useRef<E>(null);
  const rafRef = useRef<number | null>(null);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const scrollToBottom = useCallback(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, []);

  // Scroll on dep changes (non-streaming)
  useEffect(() => {
    if (!isStreamingRef.current) {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // rAF loop during streaming — keeps scroll pinned every frame
  useEffect(() => {
    if (!isStreaming) return;
    let id: number;
    const tick = () => {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { ref, scrollToBottom };
}
