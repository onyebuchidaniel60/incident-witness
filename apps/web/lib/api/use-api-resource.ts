"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "./client";

export type ApiResource<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
};

export function useApiResource<T>(
  path: string | null,
  options: { pollMs?: number } = {},
): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [version, setVersion] = useState(0);
  const hasData = useRef(false);

  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (path === null) return;

    let active = true;

    async function load() {
      if (!hasData.current) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const result = await apiRequest<T>(path as string);
        if (active) {
          hasData.current = true;
          setData(result);
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause : new Error("Request failed"));
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [path, version]);

  useEffect(() => {
    if (!options.pollMs || options.pollMs <= 0) return;
    const timer = setInterval(reload, options.pollMs);
    return () => clearInterval(timer);
  }, [options.pollMs, reload]);

  return { data, error, loading, refreshing, reload };
}
