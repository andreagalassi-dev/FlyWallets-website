"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET `path` (re-fetched when `path` changes or after `reload()`).
 * Returns { data, loading, error, reload }. The previous data stays available while a new request
 * is in flight, so lists do not flash empty on filter changes.
 */
export default function useApiData(path) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: "" });
  const key = `${path}#${version}`;

  useEffect(() => {
    const controller = new AbortController();
    api
      .get(path, { signal: controller.signal })
      .then((res) => setResult({ key, data: res.data.data, error: "" }))
      .catch((err) => {
        if (err.code === "ERR_CANCELED") return;
        setResult({ key, data: null, error: getErrorMessage(err, "Could not load data") });
      });
    return () => controller.abort();
  }, [path, key]);

  const loading = result.key !== key;
  return {
    data: result.data,
    loading,
    error: loading ? "" : result.error,
    reload: () => setVersion((v) => v + 1),
  };
}
