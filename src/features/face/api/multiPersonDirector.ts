import { api } from "../../../core/api/client";
import { DIRECTOR_BASE } from "../../../core/config/env";

export type DirectorRunState =
  | "queued"
  | "running"
  | "drafting"
  | "retrieving"
  | "planning"
  | "critiquing"
  | "awaiting_review"
  | "approved"
  | "compiling"
  | "ready"
  | "failed";

export type PlannedParticipant = {
  display_name: string;
  role?: string | null;
  preferred_locale?: string | null;
  persona?: Record<string, any>;
  continuity?: Record<string, any>;
  visual_direction?: Record<string, any>;
  voice_direction?: Record<string, any>;
};

export type PlannedScene = {
  sequence: number;
  title?: string | null;
  purpose?: string | null;
  participant_refs?: string[];
};

export type CreativeStoryPlan = {
  title: string;
  logline?: string | null;
  summary?: string | null;
  participants: PlannedParticipant[];
  scenes: PlannedScene[];
  assumptions?: string[];
};

export type CreativeCritique = {
  score: number;
  ready: boolean;
  issues?: string[];
  revision_instructions?: string[];
  continuity_issues?: string[];
  safety_notes?: string[];
};

export type DirectorInterrupt = {
  type?: string;
  run_id?: string;
  thread_id?: string;
  plan?: CreativeStoryPlan | null;
  critique?: CreativeCritique | null;
  revision_count?: number;
};

export type DirectorRunView = {
  run_id: string;
  thread_id: string;
  state: DirectorRunState;
  project_id?: string | null;
  story_id?: string | null;
  workspace?: {
    project_id: string;
    story_id: string;
    title: string;
    participants: Array<{
      participant_id: string;
      display_name?: string | null;
    }>;
    scenes: any[];
  } | null;
  interrupt?: DirectorInterrupt | null;
  errors?: string[];
};

export type CreativeBriefInput = {
  text: string;
  locale?: string | null;
  desired_duration_seconds?: number | null;
  desired_scene_count?: number | null;
  participant_hints?: Array<Record<string, any>>;
  constraints?: Record<string, any>;
};

export function createDirectorRun(brief: CreativeBriefInput) {
  return api.post<DirectorRunView>(DIRECTOR_BASE, "/api/director/runs", {
    text: brief.text,
    locale: brief.locale ?? null,
    desired_duration_seconds: brief.desired_duration_seconds ?? null,
    desired_scene_count: brief.desired_scene_count ?? null,
    participant_hints: brief.participant_hints ?? [],
    constraints: brief.constraints ?? {},
  });
}

export function getDirectorRun(threadId: string) {
  return api.get<DirectorRunView>(
    DIRECTOR_BASE,
    `/api/director/runs/${encodeURIComponent(threadId)}`
  );
}

export function resumeDirectorRun(
  threadId: string,
  params: { approved: boolean; feedback?: string | null }
) {
  return api.post<DirectorRunView>(
    DIRECTOR_BASE,
    `/api/director/runs/${encodeURIComponent(threadId)}/resume`,
    {
      approved: params.approved,
      feedback: params.feedback ?? null,
    }
  );
}

export function directorPlan(run: DirectorRunView | null | undefined) {
  return run?.interrupt?.plan ?? null;
}

export function directorCritique(run: DirectorRunView | null | undefined) {
  return run?.interrupt?.critique ?? null;
}
