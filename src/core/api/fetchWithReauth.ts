// /mnt/data/fetchWithReauth.ts
// Frontend helper for longform status polling with one-time auth refresh on 401.
//
// Intended use:
// 1) add this file at src/core/api/fetchWithReauth.ts
// 2) wire refreshAccessToken() in your AuthContext / auth client
// 3) use fetchJsonWithReauth() anywhere you poll long-running jobs

export type ReauthContext = {
  getAccessToken: () => Promise<string | null> | string | null;
  refreshAccessToken: () => Promise<string | null>;
  onAuthFailure?: () => Promise<void> | void;
};

export async function fetchJsonWithReauth<T>(
  input: string,
  init: RequestInit = {},
  auth: ReauthContext,
): Promise<T> {
  const buildInit = async (token: string | null): Promise<RequestInit> => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Accept", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers };
  };

  let token = await auth.getAccessToken();
  let res = await fetch(input, await buildInit(token));

  if (res.status === 401) {
    const bodyText = await res.text();
    const expired =
      /signature has expired|invalid token|token.*expired|jwt/i.test(bodyText);

    if (expired) {
      const refreshed = await auth.refreshAccessToken();
      if (refreshed) {
        res = await fetch(input, await buildInit(refreshed));
      } else if (auth.onAuthFailure) {
        await auth.onAuthFailure();
        throw new Error("Authentication expired and refresh failed.");
      }
    } else if (auth.onAuthFailure) {
      await auth.onAuthFailure();
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

// Example specialized poller for svc-fusion-extension longform jobs.
// Put this in src/features/fusion/api/pollLongformJob.ts or similar.

export type LongformJobView = {
  id?: string;
  job_id?: string;
  status?: string;
  stage?: string;
  progress?: {
    completed_segments?: number;
    total_segments?: number;
  };
};

export async function pollLongformJobUntilTerminal(
  jobUrl: string,
  auth: ReauthContext,
  opts?: {
    pollMs?: number;
    timeoutMs?: number;
    onTick?: (job: LongformJobView) => void;
  },
): Promise<LongformJobView> {
  const pollMs = opts?.pollMs ?? 5000;
  const timeoutMs = opts?.timeoutMs ?? 60 * 60 * 1000;
  const started = Date.now();

  while (true) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Longform polling timed out.");
    }

    const job = await fetchJsonWithReauth<LongformJobView>(jobUrl, { method: "GET" }, auth);
    opts?.onTick?.(job);

    const status = (job.status ?? "").toLowerCase();
    if (["succeeded", "completed", "done"].includes(status)) return job;
    if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      throw new Error(`Longform job ended with status=${job.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
