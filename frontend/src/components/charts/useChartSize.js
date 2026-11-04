"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Width of the element behind the returned ref, kept in sync with a ResizeObserver. */
export function useElementWidth(initial = 0) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (cb) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** True when the user asked the OS to reduce motion (false during SSR). */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
