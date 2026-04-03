import { api } from "./client";
import { endpoints } from "./endpoints";
import { DASH_BASE } from "../config/env";

export type DashboardGauge = {
  label: string;
  value_norm: number;
  [k: string]: any;
};

export type DashboardHome = {
  user_id: string;
  updated_at: string;
  gauges: Record<string, DashboardGauge>;
  alerts: Array<{ code: string; message: string; severity: "info" | "warn" | "error" }>;
  face_carousel: Array<{
    image_url: string;
    created_at: string;
    artifact_id?: string;
    meta?: any;
  }>;
  video_carousel: Array<{
    video_url: string;
    created_at: string;
    artifact_id?: string;
    meta?: any;
  }>;
  header?: any;

  // optional viewer/admin fields that TeslaDashboard reads defensively
  viewer?: any;
  is_admin?: boolean;
};

function resolveHomePath(force: boolean): string {
  // You currently call endpoints.dashboard.home(force)
  // But teams sometimes implement as string or function.
  const home = (endpoints as any)?.dashboard?.home;

  if (typeof home === "function") return home(force);
  if (typeof home === "string") return home;

  // fallback (safe)
  return "/api/dashboard/home";
}

/**
 * Fetch dashboard home.
 * Auth is handled by api client (should attach Bearer token via tokenStore/AuthContext).
 */
export function fetchDashboardHome(force = false) {
  const path = resolveHomePath(force);
  return api.get<DashboardHome>(DASH_BASE, path);
}