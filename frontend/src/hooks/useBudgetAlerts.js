"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export const ALERTS_REFRESH_MS = 5 * 60 * 1000;

/**
 * Budget alerts for the header bell: GET /budgets/alerts on mount, every 5 minutes and when the
 * window regains focus. Errors are silent (the bell simply keeps its last known state).
 * Returns { alerts, count, refresh }.
 */
export default function useBudgetAlerts() {
  const [alerts, setAlerts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/budgets/alerts");
      const list = res.data?.data?.alerts;
      setAlerts(Array.isArray(list) ? list : []);
    } catch {
      /* silent: a failing bell must never bother the user */
    }
  }, []);

  useEffect(() => {
    // Initial fetch is deferred a tick so the state update is not synchronous in the effect body
    const first = setTimeout(refresh, 0);
    const interval = setInterval(refresh, ALERTS_REFRESH_MS);
    const onFocus = () => refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { alerts, count: alerts.length, refresh };
}
