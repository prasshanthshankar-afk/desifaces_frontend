#!/usr/bin/env python3
from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    s = p.read_text()
    if new in s:
        print(f"SKIP {label}: already applied")
        return
    if s.count(old) != 1:
        raise SystemExit(f"FAIL {label}: expected one marker, found {s.count(old)}")
    p.write_text(s.replace(old, new, 1))
    print(f"PASS {label}")

# ------------------------------------------------------------------
# 1. Authenticated country parity: device location hint on first auth;
#    canonical /auth/me country wins after authentication.
# ------------------------------------------------------------------
auth = "src/core/auth/AuthContext.tsx"
replace_once(auth,
'import * as Device from "expo-device";\n',
'import * as Device from "expo-device";\nimport { getCalendars, getLocales } from "expo-localization";\n',
"auth localization import")
replace_once(auth,
'''type AuthIdentity = {\n  email: string | null;\n  userId: string | null;\n  fullName: string | null;\n  displayName: string | null;\n  user: AnyObj | null;\n  profile: AnyObj | null;\n};''',
'''type AuthIdentity = {\n  email: string | null;\n  userId: string | null;\n  fullName: string | null;\n  displayName: string | null;\n  countryCode: string | null;\n  user: AnyObj | null;\n  profile: AnyObj | null;\n};''',
"auth identity country")
replace_once(auth,
'''  displayName: string | null;\n  user: AnyObj | null;\n  profile: AnyObj | null;\n\n  mfaChallenge:''',
'''  displayName: string | null;\n  countryCode: string | null;\n  user: AnyObj | null;\n  profile: AnyObj | null;\n\n  mfaChallenge:''',
"auth context country")
replace_once(auth,
'''  fullName: null,\n  displayName: null,\n  user: null,''',
'''  fullName: null,\n  displayName: null,\n  countryCode: null,\n  user: null,''',
"empty identity country")
replace_once(auth,
'''function titleCaseFromEmail(email?: string | null) {''',
'''function deviceCountryCode(): string {\n  try {\n    const zone = String(getCalendars()?.[0]?.timeZone || "");\n    if (zone === "Asia/Kolkata" || zone === "Asia/Calcutta") return "IN";\n  } catch {}\n  try {\n    const region = String(getLocales()?.[0]?.regionCode || "").trim().toUpperCase();\n    if (/^[A-Z]{2}$/.test(region)) return region;\n  } catch {}\n  return "US";\n}\n\nfunction titleCaseFromEmail(email?: string | null) {''',
"device country resolver")
replace_once(auth,
'''  const displayName = firstNonEmpty(\n    fullName,\n    profile?.username,\n    root?.username,\n    profile?.handle,\n    root?.handle,\n    titleCaseFromEmail(email)\n  );\n\n  return {\n    email,\n    userId: resolveUserId(profile || root),\n    fullName,\n    displayName,\n    user: profile,''',
'''  const displayName = firstNonEmpty(\n    fullName,\n    profile?.username,\n    root?.username,\n    profile?.handle,\n    root?.handle,\n    titleCaseFromEmail(email)\n  );\n  const rawCountryCode = firstNonEmpty(\n    profile?.country_code, profile?.countryCode, root?.country_code, root?.countryCode\n  );\n  const countryCode = rawCountryCode && /^[A-Za-z]{2}$/.test(rawCountryCode)\n    ? rawCountryCode.toUpperCase()\n    : null;\n\n  return {\n    email,\n    userId: resolveUserId(profile || root),\n    fullName,\n    displayName,\n    countryCode,\n    user: profile,''',
"resolved canonical country")
replace_once(auth,
'''      displayName: identity.displayName,\n      user: identity.user,''',
'''      displayName: identity.displayName,\n      countryCode: identity.countryCode,\n      user: identity.user,''',
"expose country context")
replace_once(auth,
'''            device_id,\n            client_type,\n          });''',
'''            device_id,\n            client_type,\n            country_code: deviceCountryCode(),\n          });''',
"login country hint")
replace_once(auth,
'''            terms_accepted: true,\n          });''',
'''            terms_accepted: true,\n            country_code: deviceCountryCode(),\n          });''',
"registration country hint")

# Pricing snapshot must not invent US after auth; canonical auth/me drives it.
snapshot = "src/core/pricing/useAccountPricingSnapshot.ts"
replace_once(snapshot,
'''    cleanText(auth?.user?.country_code) ||\n    cleanText(claims?.country_code) ||\n    "US";''',
'''    cleanText(auth?.user?.country_code) ||\n    cleanText(claims?.country_code) ||\n    null;''',
"pricing canonical country")
replace_once(snapshot,
'''identity.countryCode || "US"],''',
'''identity.countryCode || "canonical"],''',
"pricing query key country")
replace_once(snapshot,
'''PaymentsApi.apiGetCurrentSubscription(identity.countryCode || "US")''',
'''PaymentsApi.apiGetCurrentSubscription(identity.countryCode || undefined)''',
"pricing subscription country")

# ------------------------------------------------------------------
# 2. Piku: eliminate data URI/static image dependency.
# ------------------------------------------------------------------
overlay = "src/features/assistant/AssistantOverlay.tsx"
replace_once(overlay,
'''  ActivityIndicator,\n  Image,\n  KeyboardAvoidingView,''',
'''  ActivityIndicator,\n  KeyboardAvoidingView,''',
"remove native image import")
replace_once(overlay,
'''import { PIKU_AVATAR_DATA_URI } from "./pikuAvatar";''',
'''import { PikuMark } from "./PikuMark";''',
"Piku mark import")
replace_once(overlay,
'''const SUPPORT_EMAIL = "support@desifaces.ai";\nconst PIKU_AVATAR = { uri: PIKU_AVATAR_DATA_URI };''',
'''const SUPPORT_EMAIL = "support@desifaces.ai";''',
"remove Piku data URI")
replace_once(overlay,
'''        <Image source={PIKU_AVATAR} style={styles.launcherAvatar} resizeMode="cover" />''',
'''        <PikuMark size={52} />''',
"launcher Piku mark")
replace_once(overlay,
'''                <Image source={PIKU_AVATAR} style={styles.headerAvatar} resizeMode="cover" />''',
'''                <View style={styles.headerAvatar}><PikuMark size={42} /></View>''',
"header Piku mark")

# ------------------------------------------------------------------
# 3. Canonical downloadable file extensions in the shared media helper.
#    V3 backend contracts are PNG/OpenAI face, Azure TTS MP3, Fusion MP4.
# ------------------------------------------------------------------
share = "src/core/share/share.ts"
replace_once(share,
'''function defaultExtension(type: ShareMediaType): keyof typeof MEDIA_FORMATS {\n  if (type === "audio") return "m4a";\n  if (type === "video") return "mp4";\n  return "jpg";\n}''',
'''function defaultExtension(type: ShareMediaType): keyof typeof MEDIA_FORMATS {\n  if (type === "audio") return "mp3";\n  if (type === "video") return "mp4";\n  return "png";\n}''',
"canonical download extensions")
replace_once(share,
'''const ShareService = { shareUrl };\nexport default ShareService;''',
'''export async function downloadUrl(inputUrl: string, opts: ShareUrlOpts = {}) {\n  const url = sanitizeUrl(inputUrl);\n  const type: ShareMediaType = opts.type ?? (extensionFromUrl(url) ? MEDIA_FORMATS[extensionFromUrl(url) as keyof typeof MEDIA_FORMATS].type : "image");\n  const format = MEDIA_FORMATS[defaultExtension(type)];\n  const baseDir = getWritableDirectory();\n  if (!baseDir) throw new Error("No writable directory is available for downloads.");\n  const localPath = `${baseDir}desifaces_${Date.now()}.${defaultExtension(type)}`;\n  const result = /^(file|content):\\/\\//i.test(url) ? { uri: url } : await downloadToLocalFile(url, localPath);\n  const Sharing = await getExpoSharing();\n  if (!Sharing?.isAvailableAsync || !Sharing?.shareAsync || !(await Sharing.isAvailableAsync())) {\n    throw new Error("Saving files is unavailable on this device.");\n  }\n  await Sharing.shareAsync(result.uri, {\n    dialogTitle: `Save desifaces ${defaultExtension(type).toUpperCase()}`,\n    mimeType: format.mimeType,\n    UTI: format.uti,\n  });\n  // Keep the local file available until the OS save/share sheet has completed.\n  return result.uri;\n}\n\nconst ShareService = { shareUrl, downloadUrl };\nexport default ShareService;''',
"download helper")

# Primary media viewer exposes explicit Download + Share for every media type.
viewer = "src/app/(tabs)/media/viewer.tsx"
replace_once(viewer,
'''async function shareMediaToSheet(url: string, type: MediaType) {''',
'''async function downloadMediaToDevice(url: string, type: MediaType) {\n  const safeUrl = cleanUrl(url);\n  if (!safeUrl || !ShareModule) {\n    Alert.alert("Download unavailable", "There is no valid media file to download.");\n    return;\n  }\n  try {\n    const mod = ShareModule as any;\n    if (typeof mod.downloadUrl !== "function") throw new Error("Download helper unavailable");\n    await mod.downloadUrl(safeUrl, { type, title: `desifaces ${type}` });\n  } catch (e: any) {\n    Alert.alert("Download failed", String(e?.message ?? e ?? "Download failed"));\n  }\n}\n\nasync function shareMediaToSheet(url: string, type: MediaType) {''',
"viewer download function")
replace_once(viewer,
'''  const handleShare = useCallback(async () => {\n    await shareMediaToSheet(safeUrl, type);\n  }, [safeUrl, type]);''',
'''  const handleShare = useCallback(async () => {\n    await shareMediaToSheet(safeUrl, type);\n  }, [safeUrl, type]);\n  const handleDownload = useCallback(async () => {\n    await downloadMediaToDevice(safeUrl, type);\n  }, [safeUrl, type]);\n  const downloadLabel = type === "image" ? "Download PNG" : type === "audio" ? "Download MP3" : "Download MP4";''',
"viewer download handler")
replace_once(viewer,
'''                <ActionButton label="Share" icon="⤴" primary onPress={handleShare} />\n                <ActionButton label="Dashboard"''',
'''                <ActionButton label={downloadLabel} icon="↓" primary onPress={handleDownload} />\n                <ActionButton label="Share" icon="⤴" onPress={handleShare} />\n                <ActionButton label="Dashboard"''',
"video download action")
replace_once(viewer,
'''                <ActionButton label="Use in Audio" icon="♪" primary onPress={useAudioInStudio} />\n                <ActionButton label="Share" icon="⤴" onPress={handleShare} />''',
'''                <ActionButton label="Use in Audio" icon="♪" primary onPress={useAudioInStudio} />\n                <ActionButton label={downloadLabel} icon="↓" onPress={handleDownload} />\n                <ActionButton label="Share" icon="⤴" onPress={handleShare} />''',
"audio download action")
replace_once(viewer,
'''                <ActionButton label="Remix" icon="✎" onPress={() => router.push("/(tabs)/face" as any)} />\n                <ActionButton label="Share" icon="⤴" onPress={handleShare} />''',
'''                <ActionButton label="Remix" icon="✎" onPress={() => router.push("/(tabs)/face" as any)} />\n                <ActionButton label={downloadLabel} icon="↓" onPress={handleDownload} />\n                <ActionButton label="Share" icon="⤴" onPress={handleShare} />''',
"image download action")

print("MOBILE_PRODUCTION_PARITY_PATCH=PASS")
