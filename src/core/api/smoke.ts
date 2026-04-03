import { api } from "./client";
import { CORE_BASE, FACE_BASE, AUDIO_BASE, VIDEO_BASE, DASH_BASE } from "../config/env";

export async function smokeTest() {
  const t0 = Date.now();
  const results: Record<string, any> = {};

  async function ping(name: string, base: string, path: string) {
    const start = Date.now();
    try {
      const r = await api.get<any>(base, path);
      results[name] = { ok: true, ms: Date.now() - start, sample: r };
    } catch (e: any) {
      results[name] = { ok: false, ms: Date.now() - start, error: String(e?.message ?? e) };
    }
  }

  await Promise.all([
    ping("core", CORE_BASE, "/api/health"),
    ping("face", FACE_BASE, "/api/health"),
    ping("audio", AUDIO_BASE, "/api/health"),
    ping("video", VIDEO_BASE, "/api/health"),      // if your video service exposes /api/health at gateway
    ping("dash", DASH_BASE, "/api/health"),
  ]);

  return { total_ms: Date.now() - t0, bases: { CORE_BASE, FACE_BASE, AUDIO_BASE, VIDEO_BASE, DASH_BASE }, results };
}