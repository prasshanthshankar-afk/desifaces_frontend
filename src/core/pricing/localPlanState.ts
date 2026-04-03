import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalPlanCode = "free" | "pro" | "business" | "enterprise";

export type LocalPlanOverlay = {
  planCode: LocalPlanCode;
  planName: string;
  tierCode: string;
  priceLabel: string;
  billingLabel: string;
  entitlements: string[];
  source: "local_upgrade_flow";
  updatedAt: string;
};

export type PlanFlash = {
  kind: "registered_free" | "upgraded_plan";
  title: string;
  message: string;
  planCode: LocalPlanCode;
  entitlements: string[];
};

const ACTIVE_AUTH_EMAIL_KEY = "df_active_auth_email_v1";
const PLAN_OVERLAY_PREFIX = "df_local_plan_overlay_v1:";
const PLAN_FLASH_PREFIX = "df_local_plan_flash_v1:";

const PLAN_DEFS: Record<LocalPlanCode, Omit<LocalPlanOverlay, "updatedAt">> = {
  free: {
    planCode: "free",
    planName: "Free",
    tierCode: "free",
    priceLabel: "$0 / month",
    billingLabel: "Starter included usage",
    entitlements: [],
    source: "local_upgrade_flow",
  },
  pro: {
    planCode: "pro",
    planName: "Pro",
    tierCode: "pro",
    priceLabel: "$29 / month",
    billingLabel: "Monthly subscription + included credits",
    entitlements: ["TALKING_VIDEO"],
    source: "local_upgrade_flow",
  },
  business: {
    planCode: "business",
    planName: "Business",
    tierCode: "business",
    priceLabel: "$99 / month",
    billingLabel: "Team plan with broader entitlements",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
    source: "local_upgrade_flow",
  },
  enterprise: {
    planCode: "enterprise",
    planName: "Enterprise",
    tierCode: "enterprise",
    priceLabel: "Custom",
    billingLabel: "Contract / postpaid",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
    source: "local_upgrade_flow",
  },
};

function normalizeEmail(email?: string | null) {
  return String(email ?? "").trim().toLowerCase();
}

function overlayKey(email: string) {
  return `${PLAN_OVERLAY_PREFIX}${normalizeEmail(email)}`;
}

function flashKey(email: string) {
  return `${PLAN_FLASH_PREFIX}${normalizeEmail(email)}`;
}

export function buildLocalPlanOverlay(planCode: LocalPlanCode): LocalPlanOverlay {
  const base = PLAN_DEFS[planCode];
  return {
    ...base,
    entitlements: [...base.entitlements],
    updatedAt: new Date().toISOString(),
  };
}

export async function setActiveAuthEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await AsyncStorage.setItem(ACTIVE_AUTH_EMAIL_KEY, normalized);
}

export async function getActiveAuthEmail(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(ACTIVE_AUTH_EMAIL_KEY);
    return normalizeEmail(value) || null;
  } catch {
    return null;
  }
}

export async function clearActiveAuthEmail() {
  try {
    await AsyncStorage.removeItem(ACTIVE_AUTH_EMAIL_KEY);
  } catch {}
}

export async function getLocalPlanOverlay(email?: string | null): Promise<LocalPlanOverlay | null> {
  const normalized = normalizeEmail(email) || (await getActiveAuthEmail()) || "";
  if (!normalized) return null;
  try {
    const raw = await AsyncStorage.getItem(overlayKey(normalized));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      planCode: parsed.planCode,
      planName: parsed.planName,
      tierCode: parsed.tierCode,
      priceLabel: parsed.priceLabel,
      billingLabel: parsed.billingLabel,
      entitlements: Array.isArray(parsed.entitlements) ? parsed.entitlements.map(String) : [],
      source: "local_upgrade_flow",
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    } as LocalPlanOverlay;
  } catch {
    return null;
  }
}

export async function initializeFreePlanForEmail(email: string): Promise<LocalPlanOverlay> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return buildLocalPlanOverlay("free");
  }
  const existing = await getLocalPlanOverlay(normalized);
  if (existing) return existing;
  const overlay = buildLocalPlanOverlay("free");
  await AsyncStorage.setItem(overlayKey(normalized), JSON.stringify(overlay));
  return overlay;
}

export async function applyLocalPlanUpgrade(
  planCode: LocalPlanCode,
  email?: string | null
): Promise<LocalPlanOverlay> {
  const normalized = normalizeEmail(email) || (await getActiveAuthEmail()) || "";
  if (!normalized) {
    throw new Error("We could not identify the active account for this upgrade.");
  }
  const overlay = buildLocalPlanOverlay(planCode);
  await AsyncStorage.setItem(overlayKey(normalized), JSON.stringify(overlay));
  return overlay;
}

export async function setPlanFlash(message: PlanFlash, email?: string | null) {
  const normalized = normalizeEmail(email) || (await getActiveAuthEmail()) || "";
  if (!normalized) return;
  await AsyncStorage.setItem(flashKey(normalized), JSON.stringify(message));
}

export async function consumePlanFlash(email?: string | null): Promise<PlanFlash | null> {
  const normalized = normalizeEmail(email) || (await getActiveAuthEmail()) || "";
  if (!normalized) return null;
  try {
    const key = flashKey(normalized);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    await AsyncStorage.removeItem(key);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      kind: parsed.kind,
      title: String(parsed.title || ""),
      message: String(parsed.message || ""),
      planCode: parsed.planCode,
      entitlements: Array.isArray(parsed.entitlements) ? parsed.entitlements.map(String) : [],
    } as PlanFlash;
  } catch {
    return null;
  }
}

export function inferPlanEntitlementsFromTier(value?: string | null): string[] {
  const v = String(value ?? "").trim().toLowerCase();
  if (/(enterprise|business)/.test(v)) return ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"];
  if (/(pro|creator pro)/.test(v)) return ["TALKING_VIDEO"];
  return [];
}
