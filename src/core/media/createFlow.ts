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
  owner_key?: string;
};

const KEY = "df_create_flow_ctx_v1";
let mem: CreateFlowContext | null = null;


function normalizeOwnerKey(value: unknown): string | undefined {
  const s = String(value ?? "").trim().toLowerCase();
  return s || undefined;
}

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

export async function saveCreateFlowContext(ctx: CreateFlowContext, ownerKey?: string) {
  const normalizedOwnerKey = normalizeOwnerKey(ownerKey ?? ctx.owner_key ?? (ctx as any).ownerUserId ?? (ctx as any).owner_user_id ?? (ctx as any).userId ?? (ctx as any).user_id);
  const next = compactDefined({ ...ctx, owner_key: normalizedOwnerKey });

  const loaded = await loadCreateFlowContext(normalizedOwnerKey).catch(() => null);
  const base =
    mem ||
    loaded ||
    {};

  const baseOwnerKey = normalizeOwnerKey((base as CreateFlowContext)?.owner_key);
  const shouldResetBase = !!normalizedOwnerKey && !!baseOwnerKey && baseOwnerKey !== normalizedOwnerKey;

  const payload: CreateFlowContext = {
    ...((shouldResetBase ? {} : base) as CreateFlowContext),
    ...next,
    owner_key: normalizedOwnerKey,
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

export async function loadCreateFlowContext(ownerKey?: string): Promise<CreateFlowContext | null> {
  const normalizedOwnerKey = normalizeOwnerKey(ownerKey);

  if (mem) {
    const memOwnerKey = normalizeOwnerKey(mem.owner_key);
    if (!normalizedOwnerKey || !memOwnerKey || memOwnerKey === normalizedOwnerKey) {
      return mem;
    }
    return null;
  }

  const AS = await getAsyncStorage();
  if (!AS) return null;

  try {
    const raw = await AS.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const payload = j as CreateFlowContext;
    const payloadOwnerKey = normalizeOwnerKey(payload?.owner_key);
    if (normalizedOwnerKey && payloadOwnerKey && payloadOwnerKey !== normalizedOwnerKey) {
      return null;
    }
    mem = payload;
    return payload;
  } catch {
    return null;
  }
}

export async function clearCreateFlowContextForOwnerMismatch(ownerKey?: string) {
  const normalizedOwnerKey = normalizeOwnerKey(ownerKey);
  if (!normalizedOwnerKey) return;

  const current = mem || (await loadCreateFlowContext().catch(() => null));
  const currentOwnerKey = normalizeOwnerKey(current?.owner_key);
  if (!currentOwnerKey || currentOwnerKey === normalizedOwnerKey) return;

  await clearCreateFlowContext();
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
