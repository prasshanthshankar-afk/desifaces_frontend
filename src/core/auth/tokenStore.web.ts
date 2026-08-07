const KEY_ACCESS = "df_access_token";
const KEY_REFRESH = "df_refresh_token";
const LEGACY_DF_TOKEN = "DF_TOKEN";
const LEGACY_REFRESH = "DF_REFRESH_TOKEN";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function getItem(primary: string, legacy?: string): Promise<string | null> {
  const storage = getStorage();
  if (!storage) return null;

  const current = storage.getItem(primary);
  if (current) return current;

  if (!legacy) return null;
  const oldValue = storage.getItem(legacy);
  if (!oldValue) return null;

  storage.setItem(primary, oldValue);
  return oldValue;
}

async function setItem(primary: string, value: string, legacy?: string): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(primary, value);
  if (legacy) storage.setItem(legacy, value);
}

async function removeItem(primary: string, legacy?: string): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(primary);
  if (legacy) storage.removeItem(legacy);
}

/**
 * Browser implementation of the existing tokenStore contract.
 *
 * This isolates web persistence from the native Expo SecureStore implementation
 * without changing AuthContext or API callers. A future backend-managed HTTP-only
 * session can replace this module without touching Face/Audio/Fusion features.
 */
export const tokenStore = {
  getAccess: async () => getItem(KEY_ACCESS, LEGACY_DF_TOKEN),

  setAccess: async (token: string) => {
    await setItem(KEY_ACCESS, token, LEGACY_DF_TOKEN);
  },

  getRefresh: async () => getItem(KEY_REFRESH, LEGACY_REFRESH),

  setRefresh: async (token: string) => {
    await setItem(KEY_REFRESH, token, LEGACY_REFRESH);
  },

  getTokens: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      getItem(KEY_ACCESS, LEGACY_DF_TOKEN),
      getItem(KEY_REFRESH, LEGACY_REFRESH),
    ]);
    return { accessToken, refreshToken };
  },

  setTokens: async ({
    accessToken,
    refreshToken,
  }: {
    accessToken: string;
    refreshToken: string;
  }) => {
    await Promise.all([
      setItem(KEY_ACCESS, accessToken, LEGACY_DF_TOKEN),
      setItem(KEY_REFRESH, refreshToken, LEGACY_REFRESH),
    ]);
  },

  clearAll: async () => {
    await Promise.all([
      removeItem(KEY_ACCESS, LEGACY_DF_TOKEN),
      removeItem(KEY_REFRESH, LEGACY_REFRESH),
    ]);
  },
};
