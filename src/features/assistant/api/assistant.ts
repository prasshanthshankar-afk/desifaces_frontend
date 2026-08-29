import { dfFetchJson } from "../../../core/api/dfFetch";
import { ASSISTANT_BASE } from "../../../core/config/env";

export type AssistantContextLocator = {
  surface: "mobile" | "web";
  screen: string;
  story_id?: string;
  scene_id?: string;
  participant_id?: string;
};

export type AssistantAction = {
  type: string;
  label: string;
  requires_confirmation: boolean;
};

export type AssistantChatResponse = {
  session_id: string;
  message_id: string;
  answer: string;
  context: Record<string, unknown>;
  suggested_actions: AssistantAction[];
  policy: {
    restricted: boolean;
    category?: string | null;
    redacted: boolean;
  };
  sources: string[];
};

function joinUrl(base: string, path: string) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!b) throw new Error("ASSISTANT_BASE_NOT_SET");
  return `${b}${p}`;
}

export async function sendAssistantMessage(input: {
  sessionId?: string | null;
  message: string;
  context: AssistantContextLocator;
}): Promise<AssistantChatResponse> {
  return (await dfFetchJson(joinUrl(ASSISTANT_BASE, "/api/assistant/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: input.sessionId || undefined,
      message: input.message,
      context: input.context,
    }),
  })) as AssistantChatResponse;
}

export async function deleteAssistantSession(sessionId: string): Promise<void> {
  await dfFetchJson(joinUrl(ASSISTANT_BASE, `/api/assistant/sessions/${encodeURIComponent(sessionId)}`), {
    method: "DELETE",
  });
}
