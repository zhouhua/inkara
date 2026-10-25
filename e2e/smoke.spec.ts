import { expect, type Page, test } from "@playwright/test";
import { preparePage, waitForAppReady } from "./helpers";

function sseBody(events: Record<string, unknown>[]) {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

async function stubAskAnswer(page: Page, reply = "纸面轻轻点头。") {
  await page.route("**/api/ask", async (route) => {
    const body = route.request().postDataJSON() as {
      typedText?: string;
      recallMode?: string;
    };
    const transcription = body.typedText || "";
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: sseBody([
        { type: "meta", transcription },
        { type: "delta", text: reply },
        {
          type: "done",
          transcription,
          reply,
          intent: "answer",
          recallQuery: "",
        },
      ]),
    });
  });
}

async function stubAskRecall(page: Page) {
  await page.route("**/api/ask", async (route) => {
    const body = route.request().postDataJSON() as {
      typedText?: string;
      recallMode?: string;
    };
    if (body.recallMode) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: sseBody([
          {
            type: "meta",
            transcription: body.typedText || "找失眠那页",
          },
          { type: "delta", text: "没有找到那一页。" },
          {
            type: "done",
            transcription: body.typedText || "找失眠那页",
            reply: "没有找到那一页。",
            intent: "answer",
            recallQuery: "",
          },
        ]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: sseBody([
        {
          type: "meta",
          transcription: body.typedText || "找失眠那页",
        },
        {
          type: "done",
          transcription: body.typedText || "找失眠那页",
          reply: "",
          intent: "recall",
          recallQuery: "失眠",
        },
      ]),
    });
  });

  await page.route("**/api/recall-rank", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rankedIds: [], confidence: "low" }),
    });
  });
}

async function switchToTypeMode(page: Page) {
  await page.getByRole("radio", { name: "文字" }).click();
  await expect(page.getByRole("textbox", { name: "文字" })).toBeVisible();
}

async function typeAndSubmit(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "文字" });
  await box.click();
  await box.fill(text);
  await expect(box).toHaveValue(text);
  await box.press("Enter");
}

test.beforeEach(async ({ page }) => {
  await preparePage(page);
});

test("typed ask shows thinking then completes", async ({ page }) => {
  await stubAskAnswer(page);
  await waitForAppReady(page);
  await switchToTypeMode(page);

  const askWait = page.waitForRequest(
    (req) => req.url().includes("/api/ask") && req.method() === "POST",
  );
  await typeAndSubmit(page, "今天心情不错");
  await askWait;

  // Dock may rotate embed-download tip ahead of「思考中」; assert busy status.
  await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true", {
    timeout: 10_000,
  });

  // After stream + reveal, transcription quote stays on the page.
  await expect(page.locator(".read-as-quote")).toContainText("今天心情不错", {
    timeout: 45_000,
  });
});

test("recall path reaches recalling or miss state", async ({ page }) => {
  await stubAskRecall(page);
  await waitForAppReady(page);
  await switchToTypeMode(page);

  const askWait = page.waitForRequest(
    (req) => req.url().includes("/api/ask") && req.method() === "POST",
  );
  await typeAndSubmit(page, "找失眠那页");
  await askWait;

  await expect(
    page.getByText(
      /正在笔记里找|这次没找到|在看你写的|正在写回复|打开设置|再试一次/,
    ),
  ).toBeVisible({ timeout: 45_000 });
});

test("settings opens billing entry; quota error opens billing", async ({
  page,
}) => {
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      status: 402,
      contentType: "application/json",
      body: JSON.stringify({
        error: "quota_exhausted",
        message: "No replies left",
      }),
    });
  });

  await waitForAppReady(page);

  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
  await expect(page.getByText("会员与次数")).toBeVisible();
  await page.getByRole("button", { name: "看看会员和剩余次数" }).click();
  await expect(page.getByRole("dialog", { name: "会员与次数" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "会员与次数" })).toHaveCount(0);

  await switchToTypeMode(page);
  await typeAndSubmit(page, "试一下");

  await expect(
    page.getByRole("button", { name: "补充次数，继续写" }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "补充次数，继续写" }).click();
  await expect(page.getByRole("dialog", { name: "会员与次数" })).toBeVisible();
});
