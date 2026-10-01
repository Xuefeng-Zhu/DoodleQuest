import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { example } from "../src/domain/config";

mkdirSync("evidence", { recursive: true });
const logs: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type()))
      logs.push(`${m.type()}: ${m.text()}`);
  });
});
test.afterAll(() =>
  writeFileSync(
    "evidence/dedication-console.txt",
    logs.join("\n") || "No warnings or errors.",
  ),
);

async function press(page: Page, name: string, touch = false) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  if (touch) await button.tap();
  else {
    await button.focus();
    await button.press("Enter");
  }
}
async function collect(page: Page, touch = false) {
  await press(page, "Open my gift", touch);
  await press(page, "Enter the little world", touch);
  await press(page, "1 Bell gate", touch);
  for (const bell of ["circle", "triangle", "star"])
    await press(page, `Ring ${bell} bell`, touch);
  await press(page, "2 Star garden", touch);
  await press(page, "Collect the star", touch);
}
async function deliver(page: Page, touch = false) {
  await press(page, "3 Gift mailbox", touch);
  await press(page, "Deliver the star", touch);
  await expect(page.locator('[data-dedication="carried"]')).toHaveCount(0);
  await press(page, "Open your letter", touch);
}

test("one thought follows the star, survives pause, returns in the letter and resets on replay", async ({
  page,
}) => {
  await page.goto("/example");
  await expect(page.locator('[data-dedication="opening"] p')).toHaveText(
    example.config.dedication,
  );
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true");
  await page.screenshot({ path: "evidence/dedication-opening-desktop.png" });
  await collect(page);
  const carried = page.locator('[data-dedication="carried"]');
  await expect(carried).toHaveAttribute("aria-hidden", "true");
  await expect(carried.locator("p")).toHaveText(example.config.dedication);
  await expect(page.getByRole("status")).toContainText(
    example.config.dedication,
  );
  await expect(carried).toBeInViewport({ ratio: 1 });
  // The readable DOM tag is anchored to the moving character, not a fixed HUD card.
  const garden = await carried.boundingBox();
  await page.screenshot({ path: "evidence/dedication-star-desktop.png" });
  await press(page, "3 Gift mailbox");
  await expect(
    page.getByRole("button", { name: "Deliver the star", exact: true }),
  ).toBeVisible();
  const mailbox = await carried.boundingBox();
  expect(Math.abs(mailbox!.x - garden!.x)).toBeGreaterThan(20);
  await press(page, "Pause and settings");
  await expect(page.getByRole("dialog")).toBeVisible();
  // Commit the paused pose and project it into Html before measuring the freeze.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const paused = await carried.boundingBox();
  await page.waitForTimeout(400);
  expect(await carried.boundingBox()).toEqual(paused);
  await press(page, "Back to the adventure");
  await page.screenshot({ path: "evidence/dedication-mailbox-desktop.png" });
  await press(page, "Deliver the star");
  await expect(carried).toHaveCount(0);
  await press(page, "Open your letter");
  await expect(page.locator('[data-dedication="letter"] p')).toHaveText(
    example.config.dedication,
  );
  await expect(page.locator(".personal-message")).toHaveText(
    example.config.message,
  );
  await expect(page.locator(".letter-sheet")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "evidence/dedication-letter-desktop.png" });
  await press(page, "Fold the letter");
  await press(page, "Open your letter");
  await expect(page.locator('[data-dedication="letter"] p')).toHaveText(
    example.config.dedication,
  );
  await press(page, "Play again");
  await expect(page.locator('[data-dedication="opening"] p')).toHaveText(
    example.config.dedication,
  );
  await expect(carried).toHaveCount(0);
  await expect(page.locator('[data-dedication="letter"]')).toHaveCount(0);
  expect(logs.filter((log) => log.startsWith("pageerror:"))).toEqual([]);
});

test.describe("small touch screen", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  test("a maximum-length literal phrase stays readable through touch play", async ({
    page,
  }) => {
    const dedication = "Moon&Star<3".repeat(6);
    await page.route("**/api/gifts/dedication-long", (route) =>
      route.fulfill({
        json: {
          ...example,
          config: { ...example.config, dedication, showDrawing: false },
        },
      }),
    );
    await page.goto("/gift/dedication-long");
    await expect(page.locator('[data-dedication="opening"] p')).toHaveText(
      dedication,
    );
    await expect(
      page.getByRole("button", { name: "Open my gift" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true");
    await page.screenshot({ path: "evidence/dedication-opening-mobile.png" });
    await collect(page, true);
    const carried = page.locator('[data-dedication="carried"]');
    await expect(carried.locator("p")).toHaveText(dedication);
    await expect(carried).toBeInViewport({ ratio: 1 });
    expect(await carried.locator("p").evaluate((p) => p.children.length)).toBe(
      0,
    );
    await page.screenshot({ path: "evidence/dedication-star-mobile.png" });
    await deliver(page, true);
    const letterTag = page.locator('[data-dedication="letter"]');
    await letterTag.scrollIntoViewIfNeeded();
    await expect(letterTag).toBeInViewport({ ratio: 1 });
    await expect(letterTag.locator("p")).toHaveText(dedication);
    await expect(page.locator(".letter-keepsake")).toHaveCount(0);
    await page.screenshot({ path: "evidence/dedication-letter-mobile.png" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".letter-sheet")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBe(true);
  });
});

test("legacy gifts omit the detail entirely and an empty field can be saved and cleared", async ({
  page,
}) => {
  const { dedication: _removed, ...legacy } = example.config;
  await page.route("**/api/gifts/dedication-legacy", (route) =>
    route.fulfill({ json: { ...example, config: legacy } }),
  );
  await page.goto("/gift/dedication-legacy");
  await expect(page.locator("[data-dedication]")).toHaveCount(0);
  await collect(page);
  await expect(page.locator("[data-dedication]")).toHaveCount(0);
  await deliver(page);
  await expect(page.locator("[data-dedication]")).toHaveCount(0);
  await page.goto("/create");
  await page
    .getByRole("button", { name: "Try it with our Pip drawing" })
    .click();
  await page.getByRole("button", { name: "That’s my hero" }).click();
  const input = page.getByLabel("A little saying (optional)", { exact: true });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("maxlength", "60");
  await input.fill("Our Saturday adventures");
  await expect(page.locator('[data-dedication="preview"] p')).toHaveCSS(
    "color",
    "rgb(87, 78, 52)",
  );
  await expect(page.locator(".hero-preview canvas")).toBeVisible();
  // Let the loaded canvas and its ResizeObserver settle for real visual evidence.
  await page.waitForTimeout(700);
  await page.screenshot({
    path: "evidence/dedication-creator-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: "evidence/dedication-creator-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 320, height: 740 });
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Save & preview" }).click();
  await page.getByRole("button", { name: "Edit the note" }).click();
  await input.clear();
  await page.getByRole("button", { name: "Save & preview" }).click();
  await page.reload();
  await expect(input).toHaveValue("");
  await expect(page.locator("[data-dedication]")).toHaveCount(0);
  // Exercise server validation too, not only the input's browser limit.
  const id = await page.evaluate(() => localStorage.getItem("dq_draft"));
  const response = await page.request.patch(`/api/projects/${id}`, {
    headers: { origin: "http://localhost:3107" },
    data: { ...example.config, dedication: "x".repeat(61) },
  });
  expect(response.status()).toBe(400);
  const saved = await page.request.get(`/api/projects/${id}`);
  expect((await saved.json()).config.dedication).toBe("");
});
