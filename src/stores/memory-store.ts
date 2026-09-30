"use client";

import { create } from "zustand";
import {
  clearMemory,
  deleteMemoryPage,
  hydrateMemory,
  loadMemory,
  type MemoryPage,
} from "@/lib/memory";

type MemoryStore = {
  pages: MemoryPage[];
  count: number;
  /** Pull latest from the persistence module cache into the store. */
  refresh: () => MemoryPage[];
  hydrate: () => Promise<MemoryPage[]>;
  clear: () => void;
  remove: (id: string) => MemoryPage[];
};

function snapshot(): Pick<MemoryStore, "pages" | "count"> {
  const pages = loadMemory();
  return { pages: [...pages], count: pages.length };
}

export const useMemoryStore = create<MemoryStore>((set) => ({
  pages: [],
  count: 0,

  refresh: () => {
    const next = snapshot();
    set(next);
    return next.pages;
  },

  hydrate: async () => {
    await hydrateMemory();
    const next = snapshot();
    set(next);
    return next.pages;
  },

  clear: () => {
    clearMemory();
    set({ pages: [], count: 0 });
  },

  remove: (id) => {
    deleteMemoryPage(id);
    const next = snapshot();
    set(next);
    return next.pages;
  },
}));
