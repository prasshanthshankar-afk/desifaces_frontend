// src/features/face-studio/api/faceStudioService.ts
import {
  createFaceCreatorJobWithOptionalUpload,
  CreatorPlatformRequest,
  getFaceCreatorJobStatus,
  JobStatusResponse,
} from "../../../core/api/faceClient";
import {
  CreditsBalanceResponse,
  PricingQuoteResponse,
  quoteFaceStudioGenerate,
} from "../../../core/api/pricingClient";

export type FaceStudioQuoteInput = {
  token: string;
  userId: string;
  countryCode?: string | null;
  mode: "text-to-image" | "image-to-image";
  numVariants: number;
  currency?: string;
};

export type FaceStudioQuoteResult = {
  balance: CreditsBalanceResponse;
  quote: PricingQuoteResponse;
};

export type FaceStudioGenerateInput = {
  token: string;
  request: CreatorPlatformRequest;
  sourceImageFile?: {
    uri: string;
    name?: string;
    type?: string;
  };
};

export async function getFaceStudioQuote(
  params: FaceStudioQuoteInput
): Promise<FaceStudioQuoteResult> {
  return quoteFaceStudioGenerate({
    token: params.token,
    userId: params.userId,
    countryCode: params.countryCode,
    mode: params.mode,
    numVariants: params.numVariants,
    currency: params.currency,
  });
}

export async function generateFaceStudioJob(
  params: FaceStudioGenerateInput
): Promise<{ jobId: string; created: Awaited<ReturnType<typeof createFaceCreatorJobWithOptionalUpload>> }> {
  const created = await createFaceCreatorJobWithOptionalUpload({
    token: params.token,
    body: withRequestDefaults(params.request),
    sourceImageFile: params.sourceImageFile,
  });

  return {
    jobId: created.job_id,
    created,
  };
}

export async function getFaceStudioJobStatus(params: {
  token: string;
  jobId: string;
}): Promise<JobStatusResponse> {
  return getFaceCreatorJobStatus({
    token: params.token,
    jobId: params.jobId,
  });
}

export async function pollFaceStudioJobUntilDone(params: {
  token: string;
  jobId: string;
  timeoutMs?: number;
  intervalMs?: number;
  onPoll?: (status: JobStatusResponse) => void;
}): Promise<JobStatusResponse> {
  const timeoutMs = params.timeoutMs ?? 120_000;
  const intervalMs = params.intervalMs ?? 2_500;
  const startedAt = Date.now();

  while (true) {
    const status = await getFaceCreatorJobStatus({
      token: params.token,
      jobId: params.jobId,
    });

    params.onPoll?.(status);

    if (
      status.status === "succeeded" ||
      status.status === "failed" ||
      status.status === "cancelled"
    ) {
      return status;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Face Studio job polling timed out");
    }

    await sleep(intervalMs);
  }
}

export async function runFaceStudioGenerateFlow(params: {
  token: string;
  request: CreatorPlatformRequest;
  sourceImageFile?: {
    uri: string;
    name?: string;
    type?: string;
  };
  timeoutMs?: number;
  intervalMs?: number;
  onPoll?: (status: JobStatusResponse) => void;
}): Promise<{
  jobId: string;
  finalStatus: JobStatusResponse;
}> {
  const { jobId } = await generateFaceStudioJob({
    token: params.token,
    request: params.request,
    sourceImageFile: params.sourceImageFile,
  });

  const finalStatus = await pollFaceStudioJobUntilDone({
    token: params.token,
    jobId,
    timeoutMs: params.timeoutMs,
    intervalMs: params.intervalMs,
    onPoll: params.onPoll,
  });

  return {
    jobId,
    finalStatus,
  };
}

function withRequestDefaults(request: CreatorPlatformRequest): CreatorPlatformRequest {
  return {
    mode: request.mode ?? "text-to-image",
    language: request.language ?? "en",
    subject_composition_code: request.subject_composition_code ?? "single_person",
    num_variants: request.num_variants ?? 4,
    seed_mode: request.seed_mode ?? "auto",
    preservation_strength:
      request.preservation_strength ??
      (request.mode === "image-to-image" ? 0.22 : 0.75),
    facial_features: request.facial_features ?? {},
    preferred_variations: request.preferred_variations ?? [],
    request_nonce:
      request.request_nonce ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ...request,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}