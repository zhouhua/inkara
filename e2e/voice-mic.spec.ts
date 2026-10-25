import { expect, test } from "@playwright/test";
import { preparePage, waitForAppReady } from "./helpers";

test.beforeEach(async ({ page }) => {
  await preparePage(page);
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
