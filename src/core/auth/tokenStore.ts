import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_ACCESS = "df_access_token";
const KEY_REFRESH = "df_refresh_token";

// Backward-compat keys (your old code used these)
const LEGACY_DF_TOKEN = "DF_TOKEN";
const LEGACY_REFRESH = "DF_REFRESH_TOKEN"; // only if you ever stored it

async function migrateLegacyAccessIfNeeded(): Promise<string | null> {
  // If SecureStore already has it, nothing to do
  const existing = await SecureStore.getItemAsync(KEY_ACCESS);
  if (existing) return existing;

  // Try legacy AsyncStorage token
  const legacy = await AsyncStorage.getItem(LEGACY_DF_TOKEN);
  if (!legacy) return null;

  // Migrate -> SecureStore
  await SecureStore.setItemAsync(KEY_ACCESS, legacy);
  return legacy;
}

async function migrateLegacyRefreshIfNeeded(): Promise<string | null> {
  const existing = await SecureStore.getItemAsync(KEY_REFRESH);
  if (existing) return existing;

  const legacy = await AsyncStorage.getItem(LEGACY_REFRESH);
  if (!legacy) return null;

  await SecureStore.setItemAsync(KEY_REFRESH, legacy);
  return legacy;
}

export const tokenStore = {
  getAccess: async () => {
    // ✅ auto-migrate from old AsyncStorage DF_TOKEN if needed
    const migrated = await migrateLegacyAccessIfNeeded();
    if (migrated) return migrated;
    return SecureStore.getItemAsync(KEY_ACCESS);
  },

  setAccess: async (t: string) => {
    await SecureStore.setItemAsync(KEY_ACCESS, t);
    // Optional: keep legacy in sync for older modules
    await AsyncStorage.setItem(LEGACY_DF_TOKEN, t);
  },

  getRefresh: async () => {
    const migrated = await migrateLegacyRefreshIfNeeded();
    if (migrated) return migrated;
    return SecureStore.getItemAsync(KEY_REFRESH);
  },

  setRefresh: async (t: string) => {
    await SecureStore.setItemAsync(KEY_REFRESH, t);
    // Optional legacy sync
    await AsyncStorage.setItem(LEGACY_REFRESH, t);
  },

  clearAll: async () => {
    await SecureStore.deleteItemAsync(KEY_ACCESS);
    await SecureStore.deleteItemAsync(KEY_REFRESH);

    // Clear legacy too
    await AsyncStorage.removeItem(LEGACY_DF_TOKEN);
    await AsyncStorage.removeItem(LEGACY_REFRESH);
  },
};