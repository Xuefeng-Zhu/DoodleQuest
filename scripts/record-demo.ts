import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 30000 });
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
await mkdir("evidence", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: {
    dir: "evidence/recording-raw",
    size: { width: 1440, height: 1000 },
  },
});
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type()))
    errors.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
const base = process.env.DEMO_BASE_URL || "http://localhost:3000";
await page.goto(base);
await page.locator('canvas[data-ready="true"]').waitFor();
const start = Date.now();
async function holdUntil(seconds: number) {
  const ms = start + seconds * 1000 - Date.now();
  if (ms > 0) await page.waitForTimeout(ms);
}
await page.screenshot({ path: "evidence/landing-desktop.png", fullPage: true });
await holdUntil(8);
await page.getByRole("link", { name: "Create a gift", exact: true }).click();
await page.getByRole("button", { name: "Try it with our Pip drawing" }).click();
await expect(
  page.getByRole("button", { name: "That’s my hero" }),
).toBeEnabled();
await page.locator(".hero-preview canvas").waitFor();
await page.waitForTimeout(700);
await page
  .locator(".hero-preview")
  .screenshot({ path: "evidence/hero-front.png" });
await page.screenshot({ path: "evidence/hero-approval.png", fullPage: true });
const box = await page.locator(".hero-preview canvas").boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.55, {
    steps: 25,
  });
  await page.mouse.up();
  await page.waitForTimeout(700);
  await page
    .locator(".hero-preview")
    .screenshot({ path: "evidence/hero-three-quarter.png" });
}
await holdUntil(23);
await page.getByRole("button", { name: "That’s my hero" }).click();
await page.getByLabel("For someone special").fill("Jamie");
await page.getByLabel("Made by", { exact: true }).fill("Alex");
await page
  .getByLabel("A note at the end")
  .fill(
    "You make ordinary days extraordinary.\n\nHere’s a little star for all the light you bring into my world.",
  );
await page.getByLabel("Show the original drawing").check();
await page.screenshot({
  path: "evidence/personalization-desktop.png",
  fullPage: true,
});
await holdUntil(33);
await page.getByRole("button", { name: "Save & preview" }).click();
await page.getByRole("link", { name: "Play the whole adventure" }).click();
await expect(page.getByRole("button", { name: "Open my gift" })).toBeVisible();
await holdUntil(41);
await page.getByRole("button", { name: "Open my gift" }).click();
await page.getByRole("button", { name: "1 Bell gate", exact: true }).click();
await expect(
  page.getByRole("button", { name: "Ring circle bell" }),
).toBeVisible();
await page.screenshot({ path: "evidence/gameplay-desktop.png" });
await holdUntil(48);
for (const bell of ["circle", "triangle", "star"]) {
  await page
    .getByRole("button", { name: `Ring ${bell} bell`, exact: true })
    .click();
  await page.waitForTimeout(1000);
}
await holdUntil(55);
await page.getByRole("button", { name: "2 Star garden", exact: true }).click();
await expect(
  page.getByRole("button", { name: "Collect the star" }),
).toBeVisible();
await page.getByRole("button", { name: "Collect the star" }).click();
await page.screenshot({ path: "evidence/star-collected.png" });
await holdUntil(64);
await page.getByRole("button", { name: "3 Gift mailbox", exact: true }).click();
await expect(
  page.getByRole("button", { name: "Deliver the star" }),
).toBeVisible();
await holdUntil(70);
await page.getByRole("button", { name: "Deliver the star" }).click();
await page.waitForTimeout(1700);
await page.screenshot({ path: "evidence/ending-personalized.png" });
await holdUntil(80);
await page
  .getByRole("link", { name: "Creator preview · back to workshop" })
  .click();
await page.getByRole("button", { name: "5 Preview & share" }).click();
await page.getByRole("button", { name: "Publish gift link" }).click();
await expect(
  page.getByLabel("Gift link version 1", { exact: true }),
).toBeVisible();
await page.screenshot({ path: "evidence/share-desktop.png", fullPage: true });
await holdUntil(92);
const video = page.video()!;
await context.close();
await video.saveAs("evidence/walkthrough.webm");
// Measure the actual current game on the same Chromium software renderer.
const metricsContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const mpage = await metricsContext.newPage();
await mpage.goto(base + "/example");
await mpage.getByRole("button", { name: "Open my gift" }).click();
await expect(mpage.locator("canvas")).toHaveAttribute(
  "data-measurement",
  /.+/,
  { timeout: 30000 },
);
const measured = JSON.parse(
  (await mpage.locator("canvas").getAttribute("data-measurement"))!,
);
await mpage.screenshot({ path: "evidence/world-overview.png" });
await mpage.setViewportSize({ width: 390, height: 844 });
await mpage.goto(base);
await mpage.locator('canvas[data-ready="true"]').waitFor();
await mpage.screenshot({ path: "evidence/landing-mobile.png", fullPage: true });
await mpage.goto(base + "/create");
await expect(
  mpage.getByRole("button", { name: "Try it with our Pip drawing" }),
).toBeEnabled();
await mpage.screenshot({ path: "evidence/creator-mobile.png", fullPage: true });
await metricsContext.close();
await writeFile(
  "evidence/render-metrics.json",
  JSON.stringify(
    {
      renderer:
        "Chromium headless, SwiftShader software rendering; not a physical-device FPS benchmark",
      viewport: { width: 1440, height: 1000 },
      measured,
      sampleDrawingBytes: (await stat("public/sample-drawing.png")).size,
      mockModelBytes: (await stat("tests/fixtures/mock.glb")).size,
      realModel: "not available; live Tripo not run",
    },
    null,
    2,
  ),
);
await writeFile(
  "evidence/walkthrough-console.txt",
  errors.join("\n") || "No warnings or errors.",
);
await browser.close();
console.log(
  "Actual product recording and rendering measurements saved in evidence/.",
);
