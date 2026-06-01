import { CORE_BASE } from "../config/env";
import { api } from "./client";
import { endpoints } from "./endpoints";

export type SupportTopic =
  | "technical_issue"
  | "billing_issue"
  | "feature_request"
  | "account_help"
  | "general_question";

export type SupportProductArea =
  | "face"
  | "audio"
  | "fusion"
  | "billing"
  | "account"
  | "general";

export type SupportPriority = "low" | "normal" | "high";

export type SupportMessage = {
  id: string;
  sender_role: "user" | "support" | "system";
  body: string;
  attachments_json?: Array<Record<string, unknown>>;
  created_at: string;
};

export type SupportRequest = {
  id: string;
  topic: string;
  product_area: string;
  priority: string;
  subject: string;
  status: string;
  latest_message_at: string;
  created_at: string;
  messages: SupportMessage[];
};

export type CreateSupportContactPayload = {
  name: string;
  email: string;
  topic: SupportTopic;
  product_area: SupportProductArea;
  priority: SupportPriority;
  subject: string;
  message: string;
  attachment_urls?: string[];
  context?: Record<string, unknown>;
};

export async function createSupportContact(
  payload: CreateSupportContactPayload
) {
  return api.post<{ request_id: string; ack_sent: boolean }>(
    CORE_BASE,
    endpoints.support.contact,
    payload
  );
}

export async function listSupportRequests(params?: {
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  qs.set("limit", String(params?.limit ?? 20));
  qs.set("offset", String(params?.offset ?? 0));

  return api.get<SupportRequest[]>(
    CORE_BASE,
    `${endpoints.support.requests}?${qs.toString()}`
  );
}

export async function getSupportRequest(id: string) {
  return api.get<SupportRequest>(CORE_BASE, endpoints.support.byId(id));
}

export async function replySupportRequest(
  id: string,
  payload: { body: string; attachment_urls?: string[] }
) {
  return api.post<{ ok: boolean }>(CORE_BASE, endpoints.support.reply(id), payload);
}