import { useEffect, useState } from "react";
import { ApiError, api } from "../../../core/api/client";
import { endpoints } from "../../../core/api/endpoints";
import { PRICING_BASE } from "../../../core/config/env";

async function firstOk<T>(paths: readonly string[]) {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await api.get<T>(PRICING_BASE, path);
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && error.status === 404) continue;
      throw error;
    }
  }
  if (lastError) throw lastError;
  throw new Error("No pricing summary endpoint configured");
}

export function usePlanAndUsage() {
  const [plan, setPlan] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [planRes, usageRes] = await Promise.all([
          firstOk<any>(endpoints.pricing.planSummaryCandidates),
          firstOk<any>(endpoints.pricing.usageSummaryCandidates),
        ]);

        if (!mounted) return;
        setPlan(planRes);
        setUsage(usageRes);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Unable to load plan and usage");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return { plan, usage, loading, error };
}
