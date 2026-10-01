import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const logs: string[] = [];
const errors: string[] = [];
mkdirSync("evidence", { recursive: true });
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      logs.push(`${message.type()}: ${message.text()}`);
  });
});
test.afterAll(() =>
  writeFileSync(
    "evidence/celebration-console.txt",
    [...errors.map((e) => `pageerror: ${e}`), ...logs].join("\n") ||
      "No console warnings or application exceptions.",
  ),
);

async function start(page: Page, keyboard = false) {
  await page.goto("/example");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
  );
  await press(page, "Open my gift", keyboard);
  await press(page, "Enter the little world", keyboard);
  await press(page, "1 Bell gate", keyboard);
  await expect(
    page.getByRole("button", { name: "Ring circle bell" }),
  ).toBeVisible();
}
async function press(page: Page, name: string, keyboard = false) {
  const button = page.getByRole("button", { name, exact: true });
  if (keyboard) {
    await button.focus();
    await page.keyboard.press("Enter");
  } else await button.click();
}
async function capture(page: Page, name: string) {
  // These are visual captures, not a claim about physical-device frame rate.
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `evidence/celebration-${name}.png` });
}

test("island celebrates each milestone, gently resets wrong bells and resets on replay", async ({
  page,
}) => {
  await start(page);
  await capture(page, "before-desktop");
  await press(page, "Ring circle bell");
  await expect(page.getByRole("status")).toContainText("1 of 3 bells");
  await capture(page, "first-bell-desktop");
  await press(page, "Ring star bell");
  await expect(page.getByRole("status")).toContainText("Almost!");
  await capture(page, "reset-desktop");
  for (const bell of ["circle", "triangle", "star"])
    await press(page, `Ring ${bell} bell`);
  await expect(page.getByRole("status")).toContainText("ribbon is glowing");
  await capture(page, "ribbon-desktop");
  await press(page, "2 Star garden");
  await press(page, "Collect the star");
  await expect(page.getByRole("status")).toContainText("garden is blooming");
  await capture(page, "garden-desktop");
  await press(page, "3 Gift mailbox");
  await press(page, "Deliver the star");
  await press(page, "Open your letter");
  await expect(page.getByRole("status")).toContainText("whole island glows");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-measurement",
    /"stage":"complete"/,
    { timeout: 30000 },
  );
  const metrics = JSON.parse(
    (await page.locator("canvas").getAttribute("data-measurement"))!,
  );
  expect(metrics.triangles).toBeLessThanOrEqual(150000);
  expect(metrics.drawCalls).toBeLessThanOrEqual(250);
  // The software renderer may still be warming up at the start of the ending.
  // Capture the settled reward after the 120-frame measurement, not mid-transition.
  await capture(page, "ending-desktop");
  writeFileSync(
    "evidence/celebration-metrics.json",
    JSON.stringify(
      {
        renderer: "Chromium SwiftShader software rendering",
        viewport: { width: 1440, height: 1000 },
        ...metrics,
      },
      null,
      2,
    ),
  );
  await press(page, "Play again");
  await press(page, "Open my gift");
  await press(page, "Enter the little world");
  await press(page, "1 Bell gate");
  await expect(
    page.getByRole("button", { name: "Ring circle bell" }),
  ).toBeVisible();
  await capture(page, "replay-desktop");
  expect(errors).toEqual([]);
});

test("celebration freezes with pause and resumes without advancing the quest", async ({
  page,
}) => {
  await start(page);
  await press(page, "Ring circle bell");
  await press(page, "Pause and settings");
  await expect(page.getByRole("dialog")).toBeVisible();
  // Canvas only: the dialog and its focus ring are not part of this comparison.
  await page.waitForTimeout(250);
  const frozen = await page.locator("canvas").screenshot();
  await page.waitForTimeout(800);
  expect(await page.locator("canvas").screenshot()).toEqual(frozen);
  await press(page, "Back to the adventure");
  await expect(page.getByRole("status")).toContainText("1 of 3 bells");
  await press(page, "Ring triangle bell");
  await expect(page.getByRole("status")).toContainText("2 of 3 bells");
  expect(errors).toEqual([]);
});

test("mobile low-quality reduced-motion island retains every reward with keyboard controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page, true);
  await press(page, "Pause and settings", true);
  await page.getByLabel("Low-quality rendering").check();
  await press(page, "Back to the adventure", true);
  for (const bell of ["circle", "triangle", "star"])
    await press(page, `Ring ${bell} bell`, true);
  await capture(page, "ribbon-mobile");
  await press(page, "2 Star garden", true);
  await press(page, "Collect the star", true);
  await capture(page, "garden-mobile");
  await press(page, "3 Gift mailbox", true);
  await press(page, "Deliver the star", true);
  await press(page, "Open your letter", true);
  await capture(page, "ending-mobile");
  await expect(page.locator("main")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await expect(page.getByRole("status")).toContainText("whole island glows");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
