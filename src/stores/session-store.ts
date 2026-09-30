"use client";

import { create } from "zustand";

export type Phase =
  | "ready"
  | "writing"
  | "thinking"
  | "answering"
  | "recalling"
  | "error";

type SessionStore = {
  phase: Phase;
  setPhase: (phase: Phase) => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  phase: "ready",
  setPhase: (phase) => set({ phase }),
}));

export function getPhase(): Phase {
  return useSessionStore.getState().phase;
}

export function setPhase(phase: Phase): void {
  useSessionStore.getState().setPhase(phase);
}
