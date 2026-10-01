import { expect, test, type Page } from "@playwright/test";
import { OrthographicCamera, Vector3 } from "three";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  wonderHomes,
  wonderIds,
  wonderMessages,
  type Wonder,
} from "../src/domain/wonders";

mkdirSync("evidence", { recursive: true });
const errors: string[] = [],
  logs: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type()))
      logs.push(`${m.type()}: ${m.text()}`);
  });
});
test.afterAll(() =>
  writeFileSync(
    "evidence/wonders-console.txt",
    [...errors.map((e) => `pageerror: ${e}`), ...logs].join("\n") ||
      "No browser warnings or errors.",
  ),
);
async function press(page: Page, name: string, touch = false) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  if (touch) await button.tap();
  else {
    await button.focus();
    await button.press("Enter");
  }
}
async function start(page: Page) {
  await page.goto("/example");
  await expect(
    page.getByRole("button", { name: "Little wonders" }),
  ).toHaveCount(0);
  await press(page, "Open my gift");
  await press(page, "Enter the little world");
  await expect(
    page.getByRole("button", { name: "Little wonders" }),
  ).toBeVisible();
}
async function rendered(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function touchWorld(page: Page, id: Wonder, touch = false) {
  // Project authored home coordinates through the actual game's fixed camera;
  // this uses real browser pointer/touch input and real R3F raycasting, not a store shortcut.
  const box = (await page.locator("canvas").boundingBox())!;
  const camera = new OrthographicCamera(
    -box.width / 2,
    box.width / 2,
    box.height / 2,
    -box.height / 2,
    0.1,
    100,
  );
  camera.position.set(10, 10, 14);
  camera.lookAt(0, 0, 0);
  camera.zoom = Math.min(box.width / 14, box.height / 10);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const point = new Vector3(...wonderHomes[id]).project(camera);
  const x = box.x + ((point.x + 1) * box.width) / 2,
    y = box.y + ((1 - point.y) * box.height) / 2;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
async function finishQuest(page: Page) {
  await press(page, "1 Bell gate");
  for (const bell of ["circle", "triangle", "star"])
    await press(page, `Ring ${bell} bell`);
  await press(page, "2 Star garden");
  await press(page, "Collect the star");
  await press(page, "3 Gift mailbox");
  await press(page, "Deliver the star");
  await press(page, "Open your letter");
}
const controls: Record<Wonder, string> = {
  flower: "Say hello to the flower",
  cloud: "Give the cloud a tickle",
  butterfly: "Invite the butterfly along",
};

test("real scene discoveries are optional, settle, follow the hero and reset on replay", async ({
  page,
}) => {
  await start(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true");
  await rendered(page);
  await page.screenshot({ path: "evidence/wonders-idle-desktop.png" });
  await touchWorld(page, "flower");
  await expect(page.locator(".little-wonders")).toHaveAttribute(
    "data-flower",
    "true",
  );
  await expect(page.locator(".wonder-notice")).toHaveText(
    wonderMessages.flower,
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: "evidence/wonders-flower-desktop.png" });
  await touchWorld(page, "cloud");
  await expect(page.locator(".little-wonders")).toHaveAttribute(
    "data-cloud",
    "true",
  );
  await page.waitForTimeout(1100);
  await rendered(page);
  await page.screenshot({ path: "evidence/wonders-cloud-desktop.png" });
  await touchWorld(page, "butterfly");
  await expect(page.locator(".little-wonders")).toHaveAttribute(
    "data-butterfly",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "2 Star garden" }),
  ).toBeDisabled();
  await expect(page.locator(".objective")).toHaveText(
    "01 · Open the bell gate",
  );
  await press(page, "1 Bell gate");
  await expect(
    page.getByRole("button", { name: "Ring circle bell" }),
  ).toBeVisible();
  await page.screenshot({ path: "evidence/wonders-butterfly-desktop.png" });
  await expect(page.locator(".little-wonders")).toHaveAttribute(
    "data-cloud",
    "false",
  );
  await expect(page.locator(".little-wonders")).toHaveAttribute(
    "data-butterfly",
    "false",
    { timeout: 20000 },
  );
  // Activate again, then finish the unchanged quest with an effect running.
  await press(page, "Little wonders");
  await press(page, controls.butterfly);
  for (const bell of ["circle", "triangle", "star"])
    await press(page, `Ring ${bell} bell`);
  await press(page, "2 Star garden");
  await press(page, "Collect the star");
  await press(page, "3 Gift mailbox");
  await press(page, "Deliver the star");
  await expect(page.locator(".little-wonders")).toHaveCount(0);
  await press(page, "Open your letter");
  await expect(page.locator(".personal-message")).toBeVisible();
  await press(page, "Play again");
  await press(page, "Open my gift");
  await press(page, "Enter the little world");
  for (const id of wonderIds)
    await expect(page.locator(".little-wonders")).toHaveAttribute(
      `data-${id}`,
      "false",
    );
  expect(errors).toEqual([]);
});

test("keyboard discoveries collapse, pause freezes visuals and lifetimes, and rendering stays bounded", async ({
  page,
}) => {
  // Paused-dialog screenshots are particularly slow in the software renderer;
  // keep the full 120-frame measurement rather than reducing the sample.
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await start(page);
  await press(page, "Little wonders");
  await expect(
    page.getByRole("group", { name: "Optional discoveries" }),
  ).toBeVisible();
  await page.screenshot({ path: "evidence/wonders-controls-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Little wonders" }),
  ).toBeFocused();
  await expect(
    page.getByRole("group", { name: "Optional discoveries" }),
  ).toHaveCount(0);
  for (const id of ["flower", "butterfly", "cloud"] as const) {
    await press(page, "Little wonders");
    await press(page, controls[id]);
  }
  await press(page, "Pause and settings");
  await expect(page.getByRole("dialog")).toBeVisible();
  await rendered(page);
  const frozen = await page.locator("canvas").screenshot();
  await page.waitForTimeout(3100);
  expect(await page.locator("canvas").screenshot()).toEqual(frozen);
  for (const id of wonderIds)
    await expect(page.locator(".little-wonders")).toHaveAttribute(
      `data-${id}`,
      "true",
    );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-measurement",
    /"wonders":\["flower","cloud","butterfly"\]/,
    { timeout: 90000 },
  );
  const metrics = JSON.parse(
    (await page.locator("canvas").getAttribute("data-measurement"))!,
  );
  expect(metrics.triangles).toBeLessThanOrEqual(150000);
  expect(metrics.drawCalls).toBeLessThanOrEqual(250);
  writeFileSync(
    "evidence/wonders-metrics.json",
    JSON.stringify(
      {
        renderer: "Chromium SwiftShader software rendering",
        viewport: page.viewportSize(),
        pausedWithSettingsOpen: true,
        ...metrics,
      },
      null,
      2,
    ),
  );
  await press(page, "Back to the adventure");
  await expect(page.locator(".little-wonders")).toHaveAttribute(
    "data-cloud",
    "false",
    { timeout: 12000 },
  );
  await expect(page.locator(".little-wonders")).toHaveAttribute(
    "data-butterfly",
    "false",
    { timeout: 20000 },
  );
  await press(page, "Little wonders");
  await expect(
    page.getByRole("button", { name: controls.cloud }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator(".objective")).toHaveText(
    "01 · Open the bell gate",
  );
  expect(errors).toEqual([]);
});

test.describe("touch and reduced motion", () => {
  test.use({
    viewport: { width: 320, height: 740 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  test("touch scene and DOM controls work in a narrow low-quality view", async ({
    page,
  }) => {
    await start(page);
    await press(page, "Pause and settings", true);
    await page.getByLabel("Low-quality rendering").check();
    await press(page, "Back to the adventure", true);
    await rendered(page);
    await touchWorld(page, "flower", true);
    await expect(page.locator(".little-wonders")).toHaveAttribute(
      "data-flower",
      "true",
    );
    await page.screenshot({ path: "evidence/wonders-flower-mobile.png" });
    await press(page, "Little wonders", true);
    await page.screenshot({ path: "evidence/wonders-controls-mobile.png" });
    await press(page, controls.butterfly, true);
    await expect(
      page.getByRole("button", { name: "Little wonders" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".wonder-notice")).toHaveText(
      wonderMessages.butterfly,
    );
    await rendered(page);
    await page.screenshot({ path: "evidence/wonders-butterfly-mobile.png" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await finishQuest(page);
    await expect(page.locator(".personal-message")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("no-WebGL discoveries are honest readable moments and cannot skip the quest", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return original.call(this, type, ...(args as [])) as never;
    } as typeof original;
  });
  await start(page);
  await press(page, "Little wonders");
  await expect(
    page.getByText("Little moments, told in words.", { exact: false }),
  ).toBeVisible();
  await press(page, controls.cloud);
  await expect(page.locator(".wonder-notice")).toHaveText(wonderMessages.cloud);
  await expect(
    page.getByRole("button", { name: "2 Star garden" }),
  ).toBeDisabled();
  await page.screenshot({ path: "evidence/wonders-text-alternative.png" });
  await expect(page.locator(".little-wonders")).toHaveAttribute(
    "data-cloud",
    "false",
    { timeout: 10000 },
  );
  await finishQuest(page);
  await expect(page.locator(".personal-message")).toBeVisible();
});
