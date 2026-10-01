import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { example } from "../src/domain/config";

mkdirSync("evidence", { recursive: true });
const logs: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      logs.push(`${message.type()}: ${message.text()}`);
  });
});
test.afterAll(() =>
  writeFileSync(
    "evidence/letter-console.txt",
    logs.join("\n") || "No console warnings or application exceptions.",
  ),
);

async function press(page: Page, name: string, keyboard = false) {
  const button = page.getByRole("button", { name, exact: true });
  if (keyboard) {
    await button.focus();
    await page.keyboard.press("Enter");
  } else await button.click();
}
async function deliver(page: Page, keyboard = false) {
  await press(page, "Open my gift", keyboard);
  await press(page, "Enter the little world", keyboard);
  await press(page, "1 Bell gate", keyboard);
  for (const bell of ["circle", "triangle", "star"])
    await press(page, `Ring ${bell} bell`, keyboard);
  await press(page, "2 Star garden", keyboard);
  await press(page, "Collect the star", keyboard);
  await press(page, "3 Gift mailbox", keyboard);
  await press(page, "Deliver the star", keyboard);
  await expect(page.locator(".letter-ending")).toHaveAttribute(
    "data-letter-phase",
    "sealed",
  );
}

test("a sealed envelope opens into the unchanged letter, keepsake, folding and replay", async ({
  page,
}) => {
  await page.goto("/example");
  await deliver(page);
  await expect(
    page.getByRole("button", { name: "Open your letter" }),
  ).toBeFocused();
  await expect(page.locator(".personal-message")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("whole island glows");
  await page.waitForTimeout(2300);
  await page.screenshot({ path: "evidence/letter-envelope-desktop.png" });
  await press(page, "Open your letter");
  await expect(page.locator(".letter-ending")).toHaveAttribute(
    "data-letter-phase",
    "reading",
  );
  await expect(
    page.getByRole("heading", { name: "For You", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".personal-message")).toHaveText(
    example.config.message,
  );
  await expect(page.locator(".letter-signature")).toContainText(
    example.config.creator,
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "evidence/letter-open-desktop.png" });
  await page
    .getByText("The drawing that started it all", { exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Original drawing for Pip" }),
  ).toBeVisible();
  await press(page, "Fold the letter");
  await expect(
    page.getByRole("button", { name: "Open your letter" }),
  ).toBeFocused();
  await expect(page.locator(".personal-message")).toHaveCount(0);
  await press(page, "Open your letter", true);
  await expect(page.locator(".personal-message")).toHaveText(
    example.config.message,
  );
  await expect(page.getByRole("button", { name: "1 Bell gate" })).toHaveCount(
    0,
  );
  await press(page, "Play again", true);
  await expect(page.locator(".letter-ending")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open my gift" }),
  ).toBeVisible();
  await deliver(page);
  await expect(page.locator(".personal-message")).toHaveCount(0);
  expect(logs.filter((log) => log.startsWith("pageerror:"))).toEqual([]);
});

test("letter opening freezes with settings and reduced motion can finish it immediately", async ({
  page,
}) => {
  await page.goto("/example");
  await deliver(page);
  // Dispatch the two visible controls in one event turn to pause within the short opening.
  await page
    .getByRole("button", { name: "Open your letter" })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (
        document.querySelector(
          '[aria-label="Pause and settings"]',
        ) as HTMLButtonElement
      ).click();
    });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".letter-ending")).toHaveAttribute(
    "data-letter-phase",
    "opening",
  );
  await expect(page.locator(".envelope-flap")).toHaveCSS(
    "animation-play-state",
    "paused",
  );
  await page.waitForTimeout(1000);
  await expect(page.locator(".personal-message")).toHaveCount(0);
  await page.getByLabel("Reduce motion").check();
  await press(page, "Back to the adventure");
  await expect(
    page.getByRole("heading", { name: "For You", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".letter-sheet")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".personal-message")).toHaveText(
    example.config.message,
  );
});

test.describe("touch-enabled narrow viewport", () => {
  test.use({ hasTouch: true });
  test("320px touch and keyboard letter preserves long text and never fetches a forbidden drawing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const message =
      "You bring so much joy.\n\nKeep making things that could only come from you.\n"
        .repeat(17)
        .slice(0, 1200);
    const recipient = "Alexandria".repeat(5);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("forbidden-letter-drawing"))
        requests.push(request.url());
    });
    await page.route("**/api/gifts/letter-long", (route) =>
      route.fulfill({
        json: {
          ...example,
          drawingUrl: "/forbidden-letter-drawing.png",
          config: {
            ...example.config,
            recipient,
            creator: "SomeoneWhoLovesYou".repeat(2),
            message,
            showDrawing: false,
          },
        },
      }),
    );
    await page.goto("/gift/letter-long");
    await deliver(page, true);
    await page.waitForTimeout(700);
    await page.screenshot({ path: "evidence/letter-envelope-mobile-long.png" });
    await expect(
      page.getByRole("button", { name: "Play again" }),
    ).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Open your letter" }).tap();
    await expect(page.locator(".letter-sheet")).toHaveCSS(
      "animation-name",
      "none",
    );
    expect(await page.locator(".personal-message").textContent()).toBe(message);
    await expect(page.locator(".personal-message")).toHaveCSS(
      "white-space",
      "pre-wrap",
    );
    await expect(page.locator(".letter-keepsake")).toHaveCount(0);
    await page.screenshot({ path: "evidence/letter-open-mobile-long.png" });
    // Focus the native scroll region; PageDown works across desktop platforms.
    await page.locator(".letter-sheet").focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("PageDown");
    await expect(page.locator(".letter-signature")).toBeInViewport();
    await page.screenshot({
      path: "evidence/letter-signature-mobile-long.png",
    });
    await expect(
      page.getByRole("button", { name: "Fold the letter" }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Play again" }),
    ).toBeInViewport();
    expect(
      await page
        .locator(".letter-sheet")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(requests).toEqual([]);
  });
});

test("mobile letter remains readable when an opted-in keepsake image fails", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/gifts/letter-missing", (route) =>
    route.fulfill({ json: { ...example, drawingUrl: "/missing-letter.png" } }),
  );
  await page.route("**/missing-letter.png", (route) =>
    route.fulfill({ status: 404, body: "Missing test image" }),
  );
  await page.goto("/gift/letter-missing");
  await deliver(page, true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "evidence/letter-envelope-mobile.png" });
  await press(page, "Open your letter", true);
  await expect(
    page.getByRole("heading", { name: "For You", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: "evidence/letter-open-mobile.png" });
  await page
    .getByText("The drawing that started it all", { exact: true })
    .click();
  await expect(
    page.getByText("The drawing couldn’t open. Your letter is still here."),
  ).toBeVisible();
  await expect(page.locator(".personal-message")).toHaveText(
    example.config.message,
  );
});
