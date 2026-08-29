import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type AssistantContextOverride = {
  screen?: string;
  storyId?: string;
  sceneId?: string;
  participantId?: string;
};

type AssistantContextValue = {
  override: AssistantContextOverride | null;
  setOverride: (value: AssistantContextOverride | null) => void;
};

const Context = createContext<AssistantContextValue | null>(null);

export function AssistantContextProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<AssistantContextOverride | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAssistantContext() {
  const value = useContext(Context);
  if (!value) throw new Error("useAssistantContext must be used within AssistantContextProvider");
  return value;
}

export function useAssistantContextOverride(value: AssistantContextOverride | null) {
  const { setOverride } = useAssistantContext();
  const screen = value?.screen;
  const storyId = value?.storyId;
  const sceneId = value?.sceneId;
  const participantId = value?.participantId;
  const enabled = Boolean(value);

  useEffect(() => {
    if (!enabled) {
      setOverride(null);
      return;
    }
    setOverride({ screen, storyId, sceneId, participantId });
    return () => setOverride(null);
  }, [enabled, participantId, sceneId, screen, setOverride, storyId]);
}
