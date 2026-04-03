export type CreateFlowContext = {
  image_url?: string;
  audio_url?: string;

  face_artifact_id?: string;
  face_profile_id?: string;
  media_asset_id?: string;

  gender?: string;
  aspect_ratio?: "9:16" | "16:9" | "1:1" | string;

  script_text?: string;
  audio_locale?: string;
  audio_voice?: string;

  audio_artifact_id?: string;
  audio_duration_sec?: number;
  audio_duration_ms?: number;

  updated_at?: number;
};

const KEY = "df_create_flow_ctx_v1";
let mem: CreateFlowContext | null = null;

async function getAsyncStorage(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@react-native-async-storage/async-storage").default;
  } catch {
    return null;
  }
}

function compactDefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      (out as any)[k] = v;
    }
  }
  return out;
}

export async function saveCreateFlowContext(ctx: CreateFlowContext) {
  const next = compactDefined(ctx);

  const base =
    mem ||
    (await loadCreateFlowContext().catch(() => null)) ||
    {};

  const payload: CreateFlowContext = {
    ...(base as CreateFlowContext),
    ...next,
    updated_at: Date.now(),
  };

  mem = payload;

  const AS = await getAsyncStorage();
  if (!AS) return;

  try {
    await AS.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export async function loadCreateFlowContext(): Promise<CreateFlowContext | null> {
  if (mem) return mem;

  const AS = await getAsyncStorage();
  if (!AS) return null;

  try {
    const raw = await AS.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    mem = j;
    return j;
  } catch {
    return null;
  }
}

export async function clearCreateFlowContext() {
  mem = null;
  const AS = await getAsyncStorage();
  if (!AS) return;
  try {
    await AS.removeItem(KEY);
  } catch {
    // ignore
  }
}
