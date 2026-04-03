type Gender = "male" | "female";
type FaceGenerationMode = "text-to-image" | "image-to-image";
type SeedMode = "auto" | "random" | "deterministic";

export type CreatorPlatformRequest = {
  mode?: FaceGenerationMode;
  language?: string;

  age_range_code?: string | null;
  skin_tone_code?: string | null;
  region_code?: string | null;

  subject_composition_code?: "single_person" | "two_people";
  gender?: Gender | null;
  subjects?: Array<{ gender?: Gender | null; relationship_role?: string | null }> | null;

  image_format_code?: string | null;
  use_case_code?: string | null;
  style_code?: string | null;
  context_code?: string | null;
  clothing_style_code?: string | null;
  platform_code?: string | null;

  num_variants?: number;
  user_prompt?: string | null;

  seed_mode?: SeedMode;
  seed?: number | null;
  request_nonce?: string | null;

  source_image_url?: string | null;
  preservation_strength?: number;

  facial_features?: Record<string, string>;
  preferred_variations?: string[];
};

export type FaceStudioUiState = {
  prompt: string;
  variants: number;

  // chips
  styleKey?: string;       // glam/traditional/cinematic...
  backgroundKey?: string;  // indoor/outdoor/festival/studio...
  lightingKey?: string;    // natural/studio/cinematic
  lensKey?: string;        // portrait/dslr/close-up
  moodKey?: string;        // happy/confident...

  // identity hints
  gender?: Gender;
  ageRangeCode?: string | null;
  regionCode?: string | null;
  skinToneCode?: string | null;

  // composition
  isCouple?: boolean;
  subjects?: Array<{ gender?: Gender | null; relationship_role?: string | null }>;

  // optional advanced codes
  imageFormatCode?: string | null; // 1:1, 4:5 etc (if you add)
  useCaseCode?: string | null;
  clothingStyleCode?: string | null;
  platformCode?: string | null;

  // seed controls
  seedMode?: SeedMode;
  seed?: number | null;

  // i2i
  sourceImageUrl?: string | null;
  preservationStrength?: number; // 0..1
};

export function buildCreatorFaceRequest(ui: FaceStudioUiState): CreatorPlatformRequest {
  const mode: FaceGenerationMode = ui.sourceImageUrl ? "image-to-image" : "text-to-image";

  const req: CreatorPlatformRequest = {
    mode,
    language: "en",

    // demographics / hints
    gender: ui.isCouple ? null : (ui.gender ?? null),
    age_range_code: ui.ageRangeCode ?? null,
    region_code: ui.regionCode ?? null,
    skin_tone_code: ui.skinToneCode ?? null,

    // composition
    subject_composition_code: ui.isCouple ? "two_people" : "single_person",
    subjects: ui.isCouple ? (ui.subjects ?? null) : null,

    // creative codes
    style_code: ui.styleKey ?? null,
    context_code: ui.backgroundKey ?? null,
    image_format_code: ui.imageFormatCode ?? null,
    use_case_code: ui.useCaseCode ?? null,
    clothing_style_code: ui.clothingStyleCode ?? null,
    platform_code: ui.platformCode ?? null,

    // prompt + variants
    num_variants: clampInt(ui.variants, 1, 8),
    user_prompt: (ui.prompt ?? "").trim() || null,

    // seed controls
    seed_mode: ui.seedMode ?? "auto",
    seed: ui.seedMode === "deterministic" ? (ui.seed ?? null) : null,

    // i2i identity lock
    source_image_url: ui.sourceImageUrl ?? null,
    preservation_strength: ui.sourceImageUrl
      ? clamp01(ui.preservationStrength ?? 0.25) // UI default 0.25 (better for identity lock)
      : undefined,

    // advanced flexible knobs
    facial_features: cleanRecord({
      lighting: ui.lightingKey,
      lens: ui.lensKey,
      mood: ui.moodKey,
    }),

    // this is optional but useful for your diversity engine / prompt resolver
    preferred_variations: compactStrings([
      ui.styleKey,
      ui.backgroundKey,
      ui.lightingKey,
      ui.lensKey,
      ui.moodKey,
    ]),
  };

  // Remove empty objects/arrays to keep payload tidy
  if (!req.facial_features || Object.keys(req.facial_features).length === 0) delete req.facial_features;
  if (!req.preferred_variations || req.preferred_variations.length === 0) delete req.preferred_variations;

  // If no prompt provided, omit user_prompt (backend accepts null)
  if (!req.user_prompt) req.user_prompt = null;

  return req;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
function clampInt(n: number, a: number, b: number) {
  const x = Math.floor(Number(n));
  return Math.max(a, Math.min(b, x));
}
function compactStrings(arr: Array<string | undefined | null>) {
  return arr.map((s) => (s ?? "").trim()).filter(Boolean);
}
function cleanRecord(obj: Record<string, string | undefined | null>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const vv = (v ?? "").trim();
    if (vv) out[k] = vv;
  }
  return out;
}