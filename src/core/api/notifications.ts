import { CORE_BASE } from "../config/env";
import { api } from "./client";
import { endpoints } from "./endpoints";

export type NotificationCategory =
  | "jobs"
  | "billing"
  | "account"
  | "support"
  | "announcements"
  | string;

export type NotificationPriority =
  | "critical"
  | "important"
  | "info"
  | string;

export type NotificationFilter =
  | "all"
  | "jobs"
  | "billing"
  | "account"
  | "support"
  | "announcements";

export type NotificationAction = {
  label?: string | null;
  route?: string | null;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  event_type: string;
  created_at: string;
  is_read: boolean;
  image_url?: string | null;
  action?: NotificationAction | null;
  metadata?: Record<string, unknown> | null;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  unread_count: number;
};

export type NotificationPreferenceItem = {
  category: Exclude<NotificationFilter, "all">;
  in_app_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
};

export type NotificationPreferencesResponse = {
  items: NotificationPreferenceItem[];
};

export type RegisterNotificationDevicePayload = {
  expo_push_token: string;
  platform: "ios" | "android" | "web";
  device_name?: string;
  app_version?: string;
};

type NotificationListParams = {
  category?: NotificationFilter | NotificationCategory | null;
  limit?: number;
  offset?: number;
};

function normalizeListParams(
  input?: NotificationFilter | NotificationCategory | NotificationListParams | null
): NotificationListParams {
  if (typeof input === "string") {
    return {
      category: input === "all" ? null : input,
      limit: 30,
      offset: 0,
    };
  }

  const params = input ?? {};
  const category =
    typeof params.category === "string" && params.category === "all"
      ? null
      : params.category ?? null;

  return {
    category,
    limit: typeof params.limit === "number" ? params.limit : 30,
    offset: typeof params.offset === "number" ? params.offset : 0,
  };
}

export async function listNotifications(
  input?: NotificationFilter | NotificationCategory | NotificationListParams | null
) {
  const params = normalizeListParams(input);
  const qs = new URLSearchParams();

  if (params.category) qs.set("category", String(params.category));
  qs.set("limit", String(params.limit ?? 30));
  qs.set("offset", String(params.offset ?? 0));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api.get<NotificationListResponse>(
    CORE_BASE,
    `${endpoints.notifications.list}${suffix}`
  );
}

export async function getUnreadNotificationCount() {
  return api.get<{ unread_count: number }>(
    CORE_BASE,
    endpoints.notifications.unreadCount
  );
}

export async function markNotificationRead(id: string) {
  return api.post<{ ok: boolean }>(
    CORE_BASE,
    endpoints.notifications.markRead(id)
  );
}

export async function markAllNotificationsRead() {
  return api.post<{ ok: boolean }>(
    CORE_BASE,
    endpoints.notifications.markAllRead
  );
}

export async function getNotificationPreferences() {
  return api.get<NotificationPreferencesResponse>(
    CORE_BASE,
    endpoints.notifications.preferences
  );
}

export async function updateNotificationPreferences(
  items: NotificationPreferenceItem[]
) {
  return api.put<NotificationPreferencesResponse>(
    CORE_BASE,
    endpoints.notifications.preferences,
    { items } as any
  );
}

export async function registerNotificationDevice(
  payload: RegisterNotificationDevicePayload
) {
  return api.post<{ ok: boolean }>(
    CORE_BASE,
    endpoints.notifications.registerDevice,
    payload as any
  );
}
