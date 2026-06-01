import { Platform, Share } from "react-native";
import * as ExpoFileSystem from "expo-file-system";

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
    // Lazy import prevents "Cannot find native module 'ExpoSharing'" crashes at app startup.
    return await import("expo-sharing");
  } catch {
    return null;
  }
}

function getWritableDirectory(): string | null {
  const fsAny = ExpoFileSystem as any;
  const candidate =
    fsAny.cacheDirectory ||
    fsAny.documentDirectory ||
    fsAny.Paths?.cache?.uri ||
    fsAny.Paths?.cacheDirectory?.uri ||
    fsAny.Paths?.document?.uri ||
    fsAny.Paths?.documentDirectory?.uri ||
    null;

  if (!candidate) return null;
  return String(candidate).endsWith("/") ? String(candidate) : `${String(candidate)}/`;
}

async function downloadToLocalFile(url: string, localPath: string): Promise<{ uri: string }> {
  const fsAny = ExpoFileSystem as any;

  if (typeof fsAny.downloadAsync === "function") {
    return fsAny.downloadAsync(url, localPath);
  }

  if (typeof fsAny.File === "function" && typeof fsAny.downloadFileAsync === "function") {
    const file = new fsAny.File(localPath);
    const result = await fsAny.downloadFileAsync(url, file);
    const uri = result?.uri || result?.file?.uri || file?.uri || localPath;
    return { uri };
  }

  throw new Error("expo-file-system download API unavailable");
}

export async function shareUrl(inputUrl: string, opts: ShareUrlOpts = {}) {
  const url = sanitizeUrl(inputUrl);

  const title = opts.title ?? "DesiFaces";
  const message = opts.message ?? "Shared from DesiFaces";

  // 1) Fast path: native text/url share.
  try {
    if (Platform.OS === "ios") {
      await Share.share({ title, message, url } as any);
    } else {
      await Share.share({ title, message: `${message}\n${url}` });
    }
    return;
  } catch {
    // Continue to file fallback.
  }

  // 2) File fallback: better UX for media, especially Android share targets.
  try {
    const Sharing = await getExpoSharing();
    if (!Sharing?.isAvailableAsync || !Sharing?.shareAsync) throw new Error("expo-sharing unavailable");

    const clean = url.split("?")[0];
    const extGuess = (clean.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "webp", "gif", "heic", "mp4", "mov"].includes(extGuess)
      ? extGuess
      : "jpg";

    const baseDir = getWritableDirectory();
    if (!baseDir) throw new Error("No writable cache/document directory available");

    const localPath = `${baseDir}desifaces_${Date.now()}.${safeExt}`;
    const res = await downloadToLocalFile(url, localPath);

    const can = await Sharing.isAvailableAsync();
    if (can) {
      await Sharing.shareAsync(res.uri, { dialogTitle: title });
      return;
    }
  } catch {
    // Continue to final fallback.
  }

  // 3) Final fallback.
  await Share.share({ title, message: `${message}\n${url}` });
}

const ShareService = { shareUrl };
export default ShareService;
