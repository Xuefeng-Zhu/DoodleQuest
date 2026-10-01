import { expect, test } from "@playwright/test";
import { example } from "../src/domain/config";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const errors: string[] = [];
mkdirSync("evidence", { recursive: true });
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterAll(() => {
  writeFileSync(
    "evidence/reveal-console.txt",
    errors.join("\n") ||
      "No uncaught application exceptions in reveal tests. Intentional asset failures tested separately.",
  );
});

test("drawing reveal holds the quest, pauses, and brings the same canvas into the world", async ({
  page,
}) => {
  await page.goto("/example");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
  );
  const canvas = await page.locator("canvas").elementHandle();
  await page.getByRole("button", { name: "Open my gift" }).click();
  await expect(
    page.getByRole("img", { name: "The original drawing of Pip" }),
  ).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute(
    "data-reveal-phase",
    "hero",
  );
  await expect(page.getByRole("button", { name: "1 Bell gate" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Our handmade, procedural example", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "evidence/reveal-desktop.png" });
  await page.getByRole("button", { name: "Pause and settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute(
    "data-reveal-phase",
    "hero",
  );
  await page.getByRole("button", { name: "Back to the adventure" }).click();
  await page.getByRole("button", { name: "Enter the little world" }).click();
  await expect(page.locator("main")).toHaveAttribute(
    "data-reveal-phase",
    "entering",
  );
  await expect(page.locator(".reveal-drawing")).toHaveCSS("opacity", "0", {
    timeout: 1400,
  });
  await expect(page.getByRole("button", { name: "1 Bell gate" })).toHaveCount(
    0,
  );
  await expect(page.locator("main")).toHaveAttribute(
    "data-reveal-phase",
    "playing",
  );
  expect(await canvas!.evaluate((c) => c.isConnected)).toBe(true);
  await expect(
    page.getByText("01 · Open the bell gate", { exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "1 Bell gate" }).click();
  await expect(
    page.getByRole("button", { name: "Ring circle bell" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile reduced-motion reveal is static and keyboard-accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/example");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
  );
  await page.getByRole("button", { name: "Open my gift" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toHaveAttribute(
    "data-reveal-phase",
    "hero",
  );
  await expect(
    page.getByRole("heading", { name: "It started with a doodle." }),
  ).toBeFocused();
  expect(
    await page
      .locator(".reveal-drawing")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Allow R3F's ResizeObserver to settle after the introduction layout changes.
  await page.waitForTimeout(600);
  await page.screenshot({ path: "evidence/reveal-mobile.png" });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Enter the little world" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toHaveAttribute(
    "data-reveal-phase",
    "playing",
    { timeout: 1000 },
  );
});

test("camera entrance pauses and can be skipped without skipping quest prerequisites", async ({
  page,
}) => {
  await page.goto("/example");
  await page.getByRole("button", { name: "Open my gift" }).click();
  await page.getByRole("button", { name: "Enter the little world" }).click();
  await page.getByRole("button", { name: "Pause and settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(2100);
  await expect(page.locator("main")).toHaveAttribute(
    "data-reveal-phase",
    "entering",
  );
  await page.getByRole("button", { name: "Back to the adventure" }).click();
  await page.getByRole("button", { name: "Skip reveal" }).click();
  await expect(page.getByRole("button", { name: "1 Bell gate" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2 Star garden" }),
  ).toBeDisabled();
  await expect(
    page.getByText("01 · Open the bell gate", { exact: true }),
  ).toBeVisible();
});

test("privacy-off gift never mounts or fetches its drawing; skip works with keyboard", async ({
  page,
}) => {
  const drawingRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("private-drawing")) drawingRequests.push(r.url());
  });
  await page.route("**/api/gifts/reveal-private", (route) =>
    route.fulfill({
      json: {
        ...example,
        drawingUrl: "/private-drawing.png",
        config: { ...example.config, showDrawing: false },
      },
    }),
  );
  await page.goto("/gift/reveal-private");
  await page.getByRole("button", { name: "Open my gift" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Pip." }),
  ).toBeVisible();
  await expect(page.locator(".reveal-drawing")).toHaveCount(0);
  await page.getByRole("button", { name: "Skip reveal" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "1 Bell gate" })).toBeVisible();
  expect(drawingRequests).toEqual([]);
});

test("test-only model loads once across reveal and gameplay; missing drawing remains understandable", async ({
  page,
}) => {
  let modelRequests = 0;
  await page.route("**/api/gifts/reveal-model", (route) =>
    route.fulfill({
      json: {
        ...example,
        source: "mock",
        modelUrl: "/reveal-test.glb",
        drawingUrl: "/missing-drawing.png",
      },
    }),
  );
  await page.route("**/reveal-test.glb", (route) => {
    modelRequests++;
    return route.fulfill({
      body: readFileSync("tests/fixtures/mock.glb"),
      contentType: "model/gltf-binary",
    });
  });
  await page.route("**/missing-drawing.png", (route) =>
    route.fulfill({ status: 404, body: "Missing test image" }),
  );
  await page.goto("/gift/reveal-model");
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
  );
  await page.getByRole("button", { name: "Open my gift" }).click();
  await expect(
    page.getByText("The drawing couldn’t open. Your adventure is still here."),
  ).toBeVisible();
  await expect(
    page.getByText("Test character · mocked generation", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enter the little world" }).click();
  await expect(page.getByRole("button", { name: "1 Bell gate" })).toBeVisible();
  expect(modelRequests).toBe(1);
});
