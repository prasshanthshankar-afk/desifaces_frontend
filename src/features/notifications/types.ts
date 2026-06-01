export type NotificationCategory =
  | "jobs"
  | "billing"
  | "account"
  | "support"
  | "announcements";

export type NotificationFilter = "all" | NotificationCategory;

export type NotificationPriority = "critical" | "important" | "info";

export type NotificationChannel = "in_app" | "push" | "email";

export type NotificationEventType =
  | "TIER_CHANGED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "SUBSCRIPTION_UPGRADED"
  | "SUBSCRIPTION_DOWNGRADED"
  | "BILLING_RECEIPT_READY"
  | "ARTIFACT_JOB_STARTED"
  | "ARTIFACT_JOB_COMPLETED"
  | "ARTIFACT_JOB_FAILED"
  | "FACE_READY"
  | "AUDIO_READY"
  | "FUSION_READY"
  | "CREDITS_LOW"
  | "SUPPORT_REQUEST_RECEIVED"
  | "SUPPORT_REPLY_RECEIVED"
  | "SYSTEM_ANNOUNCEMENT";

export interface NotificationAction {
  label?: string;
  route?: string;
  url?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  event_type: NotificationEventType;
  created_at: string;
  is_read: boolean;
  image_url?: string | null;
  action?: NotificationAction | null;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

export interface NotificationPreferenceRow {
  category: NotificationCategory;
  in_app_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
}

export interface NotificationPreferencesResponse {
  items: NotificationPreferenceRow[];
}

export interface RegisterNotificationDevicePayload {
  expo_push_token: string;
  platform: "ios" | "android";
  device_name?: string | null;
  app_version?: string | null;
}