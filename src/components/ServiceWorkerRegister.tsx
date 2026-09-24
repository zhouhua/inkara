"use client";

import { useEffect } from "react";

/** Register the tiny shell service worker once on the client. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const id = window.setTimeout(() => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore — PWA is best-effort */
      });
    }, 800);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
