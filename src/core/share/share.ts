import * as ExpoFileSystem from "expo-file-system";

export type ShareMediaType = "image" | "audio" | "video";

export type ShareUrlOpts = {
  title?: string;
  message?: string;
  type?: ShareMediaType;
};

const MEDIA_FORMATS = {
  jpg: { type: "image", mimeType: "image/jpeg", uti: "public.jpeg" },
  jpeg: { type: "image", mimeType: "image/jpeg", uti: "public.jpeg" },
  png: { type: "image", mimeType: "image/png", uti: "public.png" },
  webp: { type: "image", mimeType: "image/webp", uti: "public.image" },
  gif: { type: "image", mimeType: "image/gif", uti: "com.compuserve.gif" },
  heic: { type: "image", mimeType: "image/heic", uti: "public.heic" },
  mp3: { type: "audio", mimeType: "audio/mpeg", uti: "public.mp3" },
  m4a: { type: "audio", mimeType: "audio/mp4", uti: "public.audio" },
  wav: { type: "audio", mimeType: "audio/wav", uti: "com.microsoft.waveform-audio" },
  aac: { type: "audio", mimeType: "audio/aac", uti: "public.audio" },
  mp4: { type: "video", mimeType: "video/mp4", uti: "public.mpeg-4" },
  mov: { type: "video", mimeType: "video/quicktime", uti: "com.apple.quicktime-movie" },
  m4v: { type: "video", mimeType: "video/x-m4v", uti: "com.apple.m4v-video" },
  webm: { type: "video", mimeType: "video/webm", uti: "public.movie" },
} as const;

function sanitizeUrl(input: string) {
  const url = String(input ?? "").trim().replace(/^"+|"+$/g, "");
  if (!url) throw new Error("shareUrl: missing url");
  if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url) && !/^content:\/\//i.test(url)) {
    throw new Error(`shareUrl: unsupported url scheme: ${url.slice(0, 20)}…`);
  }
  return url;
}

async function getExpoSharing() {
  try {
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

function extensionFromUrl(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  const candidate = (clean.split(".").pop() || "").toLowerCase();
  return candidate in MEDIA_FORMATS ? candidate : "";
}

function defaultExtension(type: ShareMediaType): keyof typeof MEDIA_FORMATS {
  if (type === "audio") return "mp3";
  if (type === "video") return "mp4";
  return "png";
}

function resolveMediaFormat(url: string, requestedType?: ShareMediaType) {
  const detectedExtension = extensionFromUrl(url) as keyof typeof MEDIA_FORMATS | "";
  const detected = detectedExtension ? MEDIA_FORMATS[detectedExtension] : null;
  const type = requestedType ?? detected?.type ?? "image";
  const extension =
    detected && (!requestedType || detected.type === requestedType)
      ? detectedExtension
      : defaultExtension(type);
  const format = MEDIA_FORMATS[extension as keyof typeof MEDIA_FORMATS];

  return { extension, mimeType: format.mimeType, uti: format.uti };
}

async function deleteLocalFile(uri: string) {
  const fsAny = ExpoFileSystem as any;
  try {
    if (typeof fsAny.deleteAsync === "function") {
      await fsAny.deleteAsync(uri, { idempotent: true });
      return;
    }
    if (typeof fsAny.File === "function") {
      const file = new fsAny.File(uri);
      if (typeof file.delete === "function") await Promise.resolve(file.delete());
    }
  } catch {
    // Best-effort cache cleanup must not turn a successful share into an error.
  }
}

async function downloadToLocalFile(url: string, localPath: string): Promise<{ uri: string }> {
  const fsAny = ExpoFileSystem as any;

  if (typeof fsAny.downloadAsync === "function") {
    return fsAny.downloadAsync(url, localPath);
  }

  if (typeof fsAny.File === "function" && typeof fsAny.downloadFileAsync === "function") {
    const file = new fsAny.File(localPath);
    const result = await fsAny.downloadFileAsync(url, file);
    return { uri: result?.uri || result?.file?.uri || file?.uri || localPath };
  }

  throw new Error("expo-file-system download API unavailable");
}

export async function shareUrl(inputUrl: string, opts: ShareUrlOpts = {}) {
  const url = sanitizeUrl(inputUrl);
  const title = opts.title ?? "desifaces";
  const Sharing = await getExpoSharing();

  if (!Sharing?.isAvailableAsync || !Sharing?.shareAsync) {
    throw new Error("Media sharing is unavailable in this app build.");
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Media sharing is unavailable on this device.");
  }

  const format = resolveMediaFormat(url, opts.type);
  const sharingOptions = {
    dialogTitle: title,
    mimeType: format.mimeType,
    UTI: format.uti,
  };

  if (/^(file|content):\/\//i.test(url)) {
    await Sharing.shareAsync(url, sharingOptions);
    return;
  }

  const baseDir = getWritableDirectory();
  if (!baseDir) throw new Error("No writable cache directory is available for media sharing.");

  const localPath = `${baseDir}desifaces_${Date.now()}.${format.extension}`;
  const result = await downloadToLocalFile(url, localPath);
  try {
    await Sharing.shareAsync(result.uri, sharingOptions);
  } finally {
    await deleteLocalFile(result.uri);
  }
}

export async function downloadUrl(inputUrl: string, opts: ShareUrlOpts = {}) {
  const url = sanitizeUrl(inputUrl);
  const type: ShareMediaType = opts.type ?? (extensionFromUrl(url) ? MEDIA_FORMATS[extensionFromUrl(url) as keyof typeof MEDIA_FORMATS].type : "image");
  const format = MEDIA_FORMATS[defaultExtension(type)];
  const baseDir = getWritableDirectory();
  if (!baseDir) throw new Error("No writable directory is available for downloads.");
  const localPath = `${baseDir}desifaces_${Date.now()}.${defaultExtension(type)}`;
  const result = /^(file|content):\/\//i.test(url) ? { uri: url } : await downloadToLocalFile(url, localPath);
  const Sharing = await getExpoSharing();
  if (!Sharing?.isAvailableAsync || !Sharing?.shareAsync || !(await Sharing.isAvailableAsync())) {
    throw new Error("Saving files is unavailable on this device.");
  }
  await Sharing.shareAsync(result.uri, {
    dialogTitle: `Save desifaces ${defaultExtension(type).toUpperCase()}`,
    mimeType: format.mimeType,
    UTI: format.uti,
  });
  return result.uri;
}

const ShareService = { shareUrl, downloadUrl };
export default ShareService;
