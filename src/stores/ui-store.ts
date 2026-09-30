"use client";

import { create } from "zustand";

type Panel = "settings" | "help" | "history" | null;

type UiStore = {
  dbReady: boolean;
  panel: Panel;
  setDbReady: (ready: boolean) => void;
  openPanel: (panel: Exclude<Panel, null>) => void;
  closePanel: () => void;
  /** Convenience booleans for existing call sites. */
  settingsOpen: boolean;
  helpOpen: boolean;
  historyOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
};

function panelFlags(panel: Panel) {
  return {
    panel,
    settingsOpen: panel === "settings",
    helpOpen: panel === "help",
    historyOpen: panel === "history",
  };
}

export const useUiStore = create<UiStore>((set) => ({
  dbReady: false,
  panel: null,
  settingsOpen: false,
  helpOpen: false,
  historyOpen: false,

  setDbReady: (ready) => set({ dbReady: ready }),

  openPanel: (panel) => set(panelFlags(panel)),
  closePanel: () => set(panelFlags(null)),

  setSettingsOpen: (open) =>
    set(open ? panelFlags("settings") : panelFlags(null)),
  setHelpOpen: (open) => set(open ? panelFlags("help") : panelFlags(null)),
  setHistoryOpen: (open) =>
    set(open ? panelFlags("history") : panelFlags(null)),
}));
