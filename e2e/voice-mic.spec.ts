import { expect, type Page, test } from "@playwright/test";

async function unregisterServiceWorkers(page: Page) {
  await page.addInitScript(() => {
    void navigator.serviceWorker
      ?.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => undefined);
  });
}

async function blockEmbeddingNetwork(page: Page) {
  await page.route(
    /huggingface\.co|hf-mirror\.com|jsdelivr\.net|onnxruntime|cdn\.jsdelivr/i,
    async (route) => {
      await route.abort();
    },
  );
}

async function waitForAppReady(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "设定" })).toBeEnabled({
    timeout: 60_000,
  });
}

test.beforeEach(async ({ page }) => {
  await unregisterServiceWorkers(page);
  await blockEmbeddingNetwork(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new Error("denied")),
      },
    });
  });
});

test("type mode shows mic; pen mode hides it", async ({ page }) => {
  await waitForAppReady(page);

  await expect(
    page.getByRole("button", { name: "按住，说出你想写的" }),
  ).toHaveCount(0);

  await page.getByRole("radio", { name: "文字" }).click();
  await expect(page.getByRole("textbox", { name: "文字" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "按住，说出你想写的" }),
  ).toBeVisible();

  await page.getByRole("radio", { name: "手写" }).click();
  await expect(
    page.getByRole("button", { name: "按住，说出你想写的" }),
  ).toHaveCount(0);
});
