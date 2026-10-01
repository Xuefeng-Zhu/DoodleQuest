import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const expect = baseExpect.configure({ timeout: 30000 });

// Read-only recipient walkthrough; no drafts, publication or paid APIs.
await mkdir("evidence/recording-raw", { recursive: true });
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
const logs: string[] = [];
page.on("console", (message) => {
  if (["warning", "error"].includes(message.type()))
    logs.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));
await page.goto(
  `${process.env.DEMO_BASE_URL || "http://localhost:3000"}/example`,
);
await expect(page.locator("main")).toHaveAttribute("data-scene-ready", "true", {
  timeout: 30000,
});
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Open my gift", exact: true }).click();
await expect(page.locator("main")).toHaveAttribute("data-reveal-phase", "hero");
await page.waitForTimeout(1800);
await page.screenshot({ path: "evidence/reveal-desktop.png" });
await page.waitForTimeout(4000);
await page.getByRole("button", { name: "Enter the little world" }).click();
await expect(page.locator("main")).toHaveAttribute(
  "data-reveal-phase",
  "playing",
);
await page.waitForTimeout(1000);
await page.screenshot({ path: "evidence/reveal-world.png" });
await page.getByRole("button", { name: "1 Bell gate", exact: true }).click();
await expect(
  page.getByRole("button", { name: "Ring circle bell" }),
).toBeVisible();
await page.waitForTimeout(1000);
for (const bell of ["circle", "triangle", "star"]) {
  await page
    .getByRole("button", { name: `Ring ${bell} bell`, exact: true })
    .click();
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1500);
const video = page.video()!;
await context.close();
await video.saveAs("evidence/reveal-walkthrough.webm");
await writeFile(
  "evidence/reveal-recording-console.txt",
  logs.join("\n") || "No console warnings or exceptions captured.",
);
await browser.close();
console.log(
  "Recorded the actual drawing-to-world reveal in evidence/reveal-walkthrough.webm (procedural example, not live Tripo).",
);
