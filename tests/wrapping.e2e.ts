import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults, type GiftConfig } from "../src/domain/config";

mkdirSync("evidence", { recursive: true });
const logs: string[] = [];
test.beforeEach(({ page }) => {
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type()))
      logs.push(`${m.type()}: ${m.text()}`);
  });
});
test.afterAll(() =>
  writeFileSync(
    "evidence/wrapping-console.txt",
    logs.join("\n") || "No warnings or errors.",
  ),
);
const headers = { origin: "http://localhost:3107" };
// Authenticated API fixtures keep the wrapping tests focused. The existing
// creator regression covers real upload, model preview and UI approval.
async function workshop(page: Page, override: Partial<GiftConfig> = {}) {
  expect((await page.request.post("/api/session", { headers })).ok()).toBe(
    true,
  );
  const p = await (
    await page.request.post("/api/projects", { headers })
  ).json();
  expect(
    (
      await page.request.post(`/api/projects/${p.id}/drawing`, {
        headers,
        multipart: { sample: "true" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`/api/projects/${p.id}/approve`, {
        headers,
        data: { loaded: true },
      })
    ).ok(),
  ).toBe(true);
  const config = {
    ...defaults,
    recipient: "Jamie",
    creator: "Alex",
    message:
      "For all our ordinary days,\nand every little adventure still to come.",
    dedication: "Our Saturday adventures",
    ...override,
  };
  expect(
    (
      await page.request.patch(`/api/projects/${p.id}`, {
        headers,
        data: config,
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/create?draft=${p.id}`);
  await page.getByRole("button", { name: "5 Preview & share" }).click();
  await expect(
    page.getByRole("button", { name: "Wrap this gift" }),
  ).toBeEnabled();
  return { id: p.id as string, config };
}
async function keyboard(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.focus();
  await button.press("Enter");
}
async function ready(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-wrap-phase", "sealed");
  await expect(dialog.locator(".parcel-seal")).toHaveCSS("opacity", "1");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("keyboard wrapping waits for real publication, prevents duplicate seals, copies and keeps version controls", async ({
  page,
  context,
  browser,
}) => {
  const { id, config } = await workshop(page);
  let posts = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/projects/${id}/publish`, async (route) => {
    posts++;
    await gate;
    await route.continue();
  });
  await keyboard(page, "Wrap this gift");
  const dialog = page.getByRole("dialog");
  await expect(page.locator("#wrapping-heading")).toBeFocused();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    expect(
      // Native dialogs can yield focus to browser chrome (reported as body),
      // but must not allow the inert workshop controls to receive it.
      await dialog.evaluate(
        (el) =>
          el.contains(document.activeElement) ||
          document.activeElement === document.body,
      ),
    ).toBe(true);
  }
  expect(
    await page.evaluate(() => {
      const before = document.activeElement;
      document.querySelector<HTMLButtonElement>(".steps button")!.focus();
      return document.activeElement === before;
    }),
  ).toBe(true);
  await page.locator("#wrapping-heading").focus();
  await expect(
    dialog.getByRole("region", { name: "Review your gift note" }),
  ).toContainText(config.message);
  await expect(dialog).toContainText(
    "Your original drawing stays out of this gift.",
  );
  await page.screenshot({ path: "evidence/wrapping-review-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Wrap this gift" }),
  ).toBeFocused();
  expect(posts).toBe(0);
  await keyboard(page, "Wrap this gift");
  await keyboard(page, "Seal & publish gift");
  await expect(dialog).toHaveAttribute("data-wrap-phase", "publishing");
  await expect(dialog.getByRole("status")).toHaveText(
    "Creating your gift link…",
  );
  await expect(dialog.locator(".parcel-seal")).toHaveCSS("opacity", "0");
  await expect(
    dialog.getByRole("button", { name: "Keeping your words safe…" }),
  ).toBeDisabled();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(posts).toBe(1);
  release();
  await ready(page);
  await expect(page.locator("#wrapping-heading")).toBeFocused();
  await expect(dialog.getByRole("status")).toContainText(
    "Nothing has been sent",
  );
  await page.screenshot({ path: "evidence/wrapping-sealed-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: "evidence/wrapping-sealed-mobile-standard.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await keyboard(page, "Copy gift link");
  await expect(
    dialog.getByText("Gift link copied. Ready to give.", { exact: true }),
  ).toBeVisible();
  const url = await dialog.getByLabel("Your wrapped gift link").inputValue();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  const recipient = await browser.newContext();
  const token = url.split("/").at(-1)!;
  expect(
    (
      await (
        await recipient.request.get(`http://localhost:3107/api/gifts/${token}`)
      ).json()
    ).config,
  ).toEqual(config);
  expect(
    (
      await recipient.request.patch(
        `http://localhost:3107/api/projects/${id}`,
        { headers, data: config },
      )
    ).status(),
  ).toBe(401);
  await recipient.close();
  await keyboard(page, "Back to my workshop");
  await expect(
    page.getByLabel("Gift link version 1", { exact: true }),
  ).toHaveValue(url);
  await page.reload();
  await page.getByRole("button", { name: "5 Preview & share" }).click();
  await expect(
    page.getByLabel("Gift link version 1", { exact: true }),
  ).toHaveValue(url);
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Revoke this link" }).click();
  await expect(
    page.getByLabel("Gift link version 1", { exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get(`/api/gifts/${token}`)).status()).toBe(404);
});

test("a lost publication response is recovered without another POST and uses the immutable words", async ({
  page,
}) => {
  const { id, config } = await workshop(page);
  let posts = 0;
  await page.route(`**/api/projects/${id}/publish`, async (route) => {
    posts++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true); // Server committed; client deliberately loses the response.
    await route.abort("failed");
  });
  await keyboard(page, "Wrap this gift");
  await keyboard(page, "Seal & publish gift");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-wrap-phase", "uncertain");
  await expect(dialog.locator(".parcel-seal")).toHaveCSS("opacity", "0");
  await expect(
    dialog.getByRole("button", { name: "Seal & publish gift" }),
  ).toHaveCount(0);
  await page.request.patch(`/api/projects/${id}`, {
    headers,
    data: {
      ...config,
      recipient: "New draft recipient",
      message: "New draft words",
    },
  });
  await page.screenshot({ path: "evidence/wrapping-unconfirmed-desktop.png" });
  await keyboard(page, "Check saved gift links");
  await ready(page);
  await expect(
    dialog.getByRole("heading", { name: "Wrapped for Jamie." }),
  ).toBeVisible();
  expect(posts).toBe(1);
  const p = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(p.shares).toHaveLength(1);
  expect(p.config.recipient).toBe("New draft recipient");
});

test("a failed save never publishes or seals; manual retry works", async ({
  page,
}) => {
  const { id } = await workshop(page);
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/publish")) posts++;
  });
  await page.route(`**/api/projects/${id}`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        json: { error: "The test storage is temporarily unavailable." },
      });
    else await route.continue();
  });
  await keyboard(page, "Wrap this gift");
  await keyboard(page, "Seal & publish gift");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-wrap-phase", "failed");
  await expect(dialog.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(dialog.locator(".parcel-seal")).toHaveCSS("opacity", "0");
  expect(posts).toBe(0);
  await page.unroute(`**/api/projects/${id}`);
  await keyboard(page, "Seal & publish gift");
  await ready(page);
  expect(posts).toBe(1);
});

test.describe("touch and quiet wrapping", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  test("320px long note stays readable, reduced motion settles, denied clipboard offers manual copy", async ({
    page,
  }) => {
    const recipient = "Someone wonderfully special ".repeat(2).slice(0, 50);
    const { config } = await workshop(page, {
      recipient,
      creator: "A maker with a wonderfully long name ".repeat(2).slice(0, 50),
      title: "A long adventure title ".repeat(4).slice(0, 80),
      message: "A small adventure made with love.\n".repeat(40).slice(0, 1200),
      dedication: "To the moon, past the stars, and all the way home.",
      showDrawing: true,
      palette: "sunset",
    });
    await page.getByRole("button", { name: "Wrap this gift" }).tap();
    const dialog = page.getByRole("dialog");
    const note = dialog.getByRole("region", { name: "Review your gift note" });
    await expect(note).toContainText(config.message);
    await expect(dialog).toContainText("Includes the original drawing");
    await note.focus();
    await note.press("End");
    await expect
      .poll(() => note.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(note.locator(".wrap-signature")).toBeInViewport();
    await page.screenshot({ path: "evidence/wrapping-review-mobile.png" });
    await dialog.getByRole("button", { name: "Seal & publish gift" }).tap();
    await ready(page);
    expect(
      await dialog
        .locator(".parcel-seal")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async () => {
          throw new DOMException("Test permission denied", "NotAllowedError");
        },
      });
    });
    await dialog
      .getByRole("button", { name: "Copy gift link", exact: true })
      .tap();
    await expect(dialog.getByRole("alert")).toContainText("copy it manually");
    await expect(dialog.getByLabel("Your wrapped gift link")).toBeFocused();
    expect(
      await dialog
        .getByLabel("Your wrapped gift link")
        .evaluate(
          (el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!,
        ),
    ).toBeGreaterThan(40);
    await page.screenshot({ path: "evidence/wrapping-copy-mobile.png" });
    await dialog.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: "evidence/wrapping-sealed-mobile.png" });
    await dialog.getByRole("button", { name: "Close gift wrapping" }).tap();
    await expect(
      page.getByRole("button", { name: "Wrap this gift" }),
    ).toBeFocused();
  });
});
