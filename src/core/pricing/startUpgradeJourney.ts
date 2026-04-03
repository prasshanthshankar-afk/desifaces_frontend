import { router } from "expo-router";

export type UpgradeJourneyIntent = "upgrade" | "topup" | "manage";
export type UpgradeSource =
  | "face"
  | "audio"
  | "fusion"
  | "billing"
  | "dashboard"
  | "settings"
  | string;

export type StartUpgradeJourneyArgs = {
  source: UpgradeSource;
  workflow?: string | null;
  intent?: UpgradeJourneyIntent | string | null;
  requiredFeature?: string | null;
  currentPlan?: string | null;
  availability?: string | null;
  settlement?: string | null;
  estimate?: string | null;
  estimateLabel?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function startUpgradeJourney(args: StartUpgradeJourneyArgs) {
  const source = clean(args.source) || "studio";
  const workflow = clean(args.workflow) || source;
  const intent = clean(args.intent) || "upgrade";

  router.push({
    pathname: "/pricing/plan-billing" as any,
    params: {
      source,
      workflow,
      intent,
      requiredFeature: clean(args.requiredFeature) || undefined,
      plan: clean(args.currentPlan) || undefined,
      availability: clean(args.availability) || undefined,
      settlement: clean(args.settlement) || undefined,
      estimate: clean(args.estimate) || undefined,
      estimate_label: clean(args.estimateLabel) || undefined,
    },
  } as any);
}
