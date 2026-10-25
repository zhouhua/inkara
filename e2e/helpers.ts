import { expect, type Page } from "@playwright/test";

/** Unregister SWs so E2E always hits the fresh Next app. */
export async function unregisterServiceWorkers(page: Page) {
  await page.addInitScript(() => {
    void navigator.serviceWorker
      ?.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => undefined);
  });
}

/** Keep hybrid recall lexical-only; do not download ONNX / Hub weights in E2E. */
export async function blockEmbeddingNetwork(page: Page) {
  await page.route(
    /huggingface\.co|hf-mirror\.com|jsdelivr\.net|onnxruntime|cdn\.jsdelivr/i,
    async (route) => {
      await route.abort();
    },
  );
}

/**
 * Force zh locale before hydrateSettings reads navigator.language.
 * CI Chromium defaults to en-US, which breaks Chinese copy assertions.
 */
export async function forceZhLocale(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "language", {
      configurable: true,
      get: () => "zh-CN",
    });
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => ["zh-CN", "zh"],
    });
  });
}

export async function preparePage(page: Page) {
  await unregisterServiceWorkers(page);
  await forceZhLocale(page);
  await blockEmbeddingNetwork(page);
}

export async function waitForAppReady(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "设置" })).toBeEnabled({
    timeout: 60_000,
  });
}
