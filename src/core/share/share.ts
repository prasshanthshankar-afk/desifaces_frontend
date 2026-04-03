import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system";

export type ShareUrlOpts = { title?: string; message?: string };

function sanitizeUrl(input: string) {
  const url = String(input ?? "").trim().replace(/^"+|"+$/g, "");
  if (!url) throw new Error("shareUrl: missing url");
  if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
    throw new Error(`shareUrl: unsupported url scheme: ${url.slice(0, 20)}…`);
  }
  return url;
}

async function getExpoSharing() {
  try {
    // Lazy import prevents "Cannot find native module 'ExpoSharing'" crash at app startup
    return await import("expo-sharing");
  } catch {
    return null;
  }
}

export async function shareUrl(inputUrl: string, opts: ShareUrlOpts = {}) {
  const url = sanitizeUrl(inputUrl);

  const title = opts.title ?? "DesiFaces";
  const message = opts.message ?? "Shared from DesiFaces";

  // 1) Fast path (text/url share)
  try {
    if (Platform.OS === "ios") {
      // iOS prefers `subject` over `title` in many share targets
      await Share.share({ subject: title, message, url });
    } else {
      await Share.share({ title, message: `${message}\n${url}` });
    }
    return;
  } catch {
    // continue
  }

  // 2) File fallback (better UX for images/videos esp. Android)
  try {
    const Sharing = await getExpoSharing();
    if (!Sharing?.isAvailableAsync || !Sharing?.shareAsync) throw new Error("expo-sharing unavailable");

    // Guess extension (ok to use path without query params for ext detection)
    const clean = url.split("?")[0];
    const extGuess = (clean.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "webp", "gif", "heic", "mp4", "mov"].includes(extGuess)
      ? extGuess
      : "jpg";

    const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!baseDir) throw new Error("No writable cache/document directory available");

    const localPath = `${baseDir}desifaces_${Date.now()}.${safeExt}`;
    const res = await FileSystem.downloadAsync(url, localPath);

    const can = await Sharing.isAvailableAsync();
    if (can) {
      await Sharing.shareAsync(res.uri, { dialogTitle: title });
      return;
    }
  } catch {
    // continue
  }

  // 3) Final fallback (always works)
  await Share.share({ title, message: `${message}\n${url}` });
}

// default export is fine if you like this style
const ShareService = { shareUrl };
export default ShareService;