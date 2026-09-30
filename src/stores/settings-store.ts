"use client";

import { create } from "zustand";
import {
  defaultSettings,
  hydrateSettings,
  patchSettings,
  type AppSettings,
} from "@/lib/settings";

type SettingsStore = {
  settings: AppSettings;
  /** True once the user (or UI) has patched this session — blocks hydrate clobber. */
  dirty: boolean;
  hydrate: () => Promise<AppSettings>;
  patch: (patch: Partial<AppSettings>) => AppSettings;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: { ...defaultSettings },
  dirty: false,

  hydrate: async () => {
    const next = await hydrateSettings();
    if (!get().dirty) {
      set({ settings: next });
    }
    return get().settings;
  },

  patch: (patch) => {
    const next = patchSettings(patch);
    set({ settings: next, dirty: true });
    return next;
  },
}));

export function getSettings(): AppSettings {
  return useSettingsStore.getState().settings;
}
