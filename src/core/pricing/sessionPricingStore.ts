import type { PricingSnapshot, PricingUiSummary, StudioKind } from "../../features/pricing/types";
import type { StudioPricingConfirmation } from "./pricePreview";

type StudioPricingSession = {
  confirmation: StudioPricingConfirmation | null;
  pricing: PricingSnapshot | null;
  pricingSummary: PricingUiSummary | null;
  lastUpdatedAt: number;
};

type PricingSessionState = Record<StudioKind, StudioPricingSession>;

type Listener = (state: PricingSessionState) => void;

const listeners = new Set<Listener>();

const emptySession = (): StudioPricingSession => ({
  confirmation: null,
  pricing: null,
  pricingSummary: null,
  lastUpdatedAt: 0,
});

let state: PricingSessionState = {
  face: emptySession(),
  audio: emptySession(),
  fusion: emptySession(),
  retail: emptySession(),
  music: emptySession(),
};

function emit() {
  listeners.forEach((listener) => listener(state));
}

export const sessionPricingStore = {
  getState() {
    return state;
  },
  getStudio(studio: StudioKind) {
    return state[studio] ?? emptySession();
  },
  setStudio(studio: StudioKind, patch: Partial<StudioPricingSession>) {
    state = {
      ...state,
      [studio]: {
        ...state[studio],
        ...patch,
        lastUpdatedAt: Date.now(),
      },
    };
    emit();
  },
  clearStudio(studio: StudioKind) {
    state = {
      ...state,
      [studio]: emptySession(),
    };
    emit();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
