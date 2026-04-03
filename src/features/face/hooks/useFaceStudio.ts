// src/features/face-studio/hooks/useFaceStudio.ts
import { useCallback, useMemo, useState } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { CreatorPlatformRequest, JobStatusResponse } from "../../../core/api/faceClient";
import {
  FaceStudioQuoteResult,
  getFaceStudioJobStatus,
  getFaceStudioQuote,
  runFaceStudioGenerateFlow,
} from "../api/faceStudioService";

type SourceImageFile = {
  uri: string;
  name?: string;
  type?: string;
};

type GenerateInput = {
  request: CreatorPlatformRequest;
  sourceImageFile?: SourceImageFile;
  timeoutMs?: number;
  intervalMs?: number;
  onPoll?: (status: JobStatusResponse) => void;
};

type QuoteInput = {
  mode: "text-to-image" | "image-to-image";
  numVariants: number;
  countryCode?: string | null;
  currency?: string;
};

type AuthLike = {
  token?: string | null;
  user?: {
    id?: string | null;
    user_id?: string | null;
    sub?: string | null;
  } | null;
  userId?: string | null;
  claims?: {
    sub?: string | null;
  } | null;
};

export function useFaceStudio() {
  const auth = useAuth() as AuthLike;

  const token = auth?.token ?? null;
  const userId = resolveUserId(auth);

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const [quoteData, setQuoteData] = useState<FaceStudioQuoteResult | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isReady = useMemo(() => Boolean(token && userId), [token, userId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setQuoteData(null);
    setJobStatus(null);
    setLastJobId(null);
    setError(null);
    setQuoteLoading(false);
    setGenerateLoading(false);
    setPolling(false);
  }, []);

  const fetchQuote = useCallback(
    async (input: QuoteInput) => {
      ensureAuth(token, userId);

      setQuoteLoading(true);
      setError(null);

      try {
        const result = await getFaceStudioQuote({
          token: token!,
          userId: userId!,
          countryCode: input.countryCode,
          mode: input.mode,
          numVariants: input.numVariants,
          currency: input.currency,
        });

        setQuoteData(result);
        return result;
      } catch (e) {
        const message = getErrorMessage(e, "Failed to fetch Face Studio quote");
        setError(message);
        throw e;
      } finally {
        setQuoteLoading(false);
      }
    },
    [token, userId]
  );

  const refreshJobStatus = useCallback(
    async (jobId?: string) => {
      ensureAuth(token, userId);

      const effectiveJobId = jobId || lastJobId;
      if (!effectiveJobId) {
        throw new Error("Missing Face Studio job id");
      }

      setPolling(true);
      setError(null);

      try {
        const status = await getFaceStudioJobStatus({
          token: token!,
          jobId: effectiveJobId,
        });

        setJobStatus(status);
        setLastJobId(effectiveJobId);
        return status;
      } catch (e) {
        const message = getErrorMessage(e, "Failed to fetch Face Studio job status");
        setError(message);
        throw e;
      } finally {
        setPolling(false);
      }
    },
    [token, userId, lastJobId]
  );

  const generate = useCallback(
    async (input: GenerateInput) => {
      ensureAuth(token, userId);

      setGenerateLoading(true);
      setPolling(true);
      setError(null);
      setJobStatus(null);

      try {
        const result = await runFaceStudioGenerateFlow({
          token: token!,
          request: input.request,
          sourceImageFile: input.sourceImageFile,
          timeoutMs: input.timeoutMs,
          intervalMs: input.intervalMs,
          onPoll: (status) => {
            setJobStatus(status);
            setLastJobId(status.job_id);
            input.onPoll?.(status);
          },
        });

        setJobStatus(result.finalStatus);
        setLastJobId(result.jobId);
        return result;
      } catch (e) {
        const message = getErrorMessage(e, "Failed to generate Face Studio job");
        setError(message);
        throw e;
      } finally {
        setGenerateLoading(false);
        setPolling(false);
      }
    },
    [token, userId]
  );

  return {
    token,
    userId,
    isReady,

    quoteLoading,
    generateLoading,
    polling,

    quoteData,
    balanceData: quoteData?.balance ?? null,
    pricingQuote: quoteData?.quote ?? null,

    jobStatus,
    lastJobId,
    error,

    clearError,
    reset,
    fetchQuote,
    refreshJobStatus,
    generate,
  };
}

function resolveUserId(auth: AuthLike | null | undefined): string | null {
  const value =
    auth?.user?.id ||
    auth?.user?.user_id ||
    auth?.user?.sub ||
    auth?.userId ||
    auth?.claims?.sub ||
    null;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ensureAuth(token?: string | null, userId?: string | null) {
  if (!token || !userId) {
    throw new Error("Missing auth token or user id");
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}