import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const evidence = "evidence";
mkdirSync(evidence, { recursive: true });
const logs: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      logs.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
});
test.afterAll(() =>
  writeFileSync(
    `${evidence}/browser-console.txt`,
    logs.join("\n") || "No browser-console warnings or errors captured.",
  ),
);
async function activate(page: Page, name: string, keyboard: boolean) {
  const b = page.getByRole("button", { name, exact: true });
  if (keyboard) {
    await b.focus();
    await page.keyboard.press("Enter");
  } else await b.click();
}
async function complete(page: Page, keyboard = false) {
  await activate(page, "Open my gift", keyboard);
  await activate(page, "1 Bell gate", keyboard);
  await expect(
    page.getByRole("button", { name: "Ring circle bell" }),
  ).toBeVisible();
  await activate(page, "Ring circle bell", keyboard);
  await activate(page, "Ring triangle bell", keyboard);
  await activate(page, "Ring star bell", keyboard);
  await expect(page.getByText("02 · Find your little star")).toBeVisible();
  await activate(page, "2 Star garden", keyboard);
  await expect(
    page.getByRole("button", { name: "Collect the star" }),
  ).toBeVisible();
  await activate(page, "Collect the star", keyboard);
  await expect(page.getByText("03 · Deliver a little light")).toBeVisible();
  await activate(page, "3 Gift mailbox", keyboard);
  await expect(
    page.getByRole("button", { name: "Deliver the star" }),
  ).toBeVisible();
  await activate(page, "Deliver the star", keyboard);
  await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
}
test("bundled example: drawing, bells, star, ending, replay", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${evidence}/landing-desktop.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Play an example", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open my gift" }),
  ).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${evidence}/opening-desktop.png` });
  await activate(page, "Open my gift", false);
  await activate(page, "1 Bell gate", false);
  await expect(
    page.getByRole("button", { name: "Ring circle bell" }),
  ).toBeVisible();
  await activate(page, "Ring star bell", false);
  await expect(page.getByRole("status")).toContainText("Almost!");
  await page.screenshot({ path: `${evidence}/gameplay-desktop.png` });
  await activate(page, "Ring circle bell", false);
  await activate(page, "Ring triangle bell", false);
  await activate(page, "Ring star bell", false);
  await activate(page, "2 Star garden", false);
  await expect(
    page.getByRole("button", { name: "Collect the star" }),
  ).toBeVisible();
  await activate(page, "Collect the star", false);
  await page.screenshot({ path: `${evidence}/star-collected.png` });
  await activate(page, "3 Gift mailbox", false);
  await expect(
    page.getByRole("button", { name: "Deliver the star" }),
  ).toBeVisible();
  await activate(page, "Deliver the star", false);
  await expect(
    page.getByText("The world is a little brighter with you in it.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidence}/ending-desktop.png` });
  await activate(page, "Play again", false);
  await expect(
    page.getByRole("button", { name: "Open my gift" }),
  ).toBeVisible();
});
test("keyboard-accessible controls finish the same quest", async ({ page }) => {
  await page.goto("/example");
  await complete(page, true);
  await expect(page.getByRole("heading", { name: "For You" })).toBeVisible();
});
test("narrow mobile, reduced motion, pause, complete", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: `${evidence}/landing-mobile.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/example");
  await activate(page, "Pause and settings", false);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Low-quality rendering").check();
  await activate(page, "Back to the adventure", false);
  await complete(page);
  await page.screenshot({ path: `${evidence}/ending-mobile.png` });
});
test("persisted draft, approval, preview, immutable sharing, ownership, revoke, delete", async ({
  page,
  browser,
}) => {
  await page.goto("/create");
  await expect(page.getByText("TEST MODE · mocked provider")).toBeVisible();
  await page.screenshot({
    path: `${evidence}/creator-desktop.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Try it with our Pip drawing" })
    .click();
  await expect(
    page.getByRole("button", { name: "That’s my hero" }),
  ).toBeEnabled();
  await page.getByLabel("What’s your hero called?").fill("Sprout");
  await page.screenshot({
    path: `${evidence}/hero-approval.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "That’s my hero" }).click();
  await page.getByLabel("For someone special").fill("Jamie");
  await page.getByLabel("Made by", { exact: true }).fill("Alex");
  await page
    .getByLabel("A note at the end")
    .fill("You make ordinary days extraordinary.");
  await page.getByLabel("Show the original drawing").check();
  await page.getByRole("button", { name: "Save & preview" }).click();
  await page.reload();
  await page.getByRole("button", { name: "5 Preview & share" }).click();
  await expect(
    page.getByText("You make ordinary days extraordinary."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Play the whole adventure" }).click();
  await complete(page);
  await page
    .getByRole("link", { name: "Creator preview · back to workshop" })
    .click();
  await page.getByRole("button", { name: "5 Preview & share" }).click();
  await page.getByRole("button", { name: "Publish gift link" }).click();
  const share = page.getByLabel("Gift link version 1", { exact: true });
  await expect(share).toBeVisible();
  const url = await share.inputValue();
  await page.screenshot({
    path: `${evidence}/share-desktop.png`,
    fullPage: true,
  });
  const projectId = await page.evaluate(() => localStorage.getItem("dq_draft"));
  const recipient = await browser.newContext();
  const gift = await recipient.newPage();
  await gift.goto(url);
  await expect(
    gift.getByRole("heading", { name: "A little world, made for Jamie." }),
  ).toBeVisible();
  expect(
    (
      await recipient.request.patch(
        `http://localhost:3107/api/projects/${projectId}`,
        { headers: { origin: "http://localhost:3107" }, data: {} },
      )
    ).status(),
  ).toBe(401);
  await complete(gift);
  await expect(
    gift.getByText("You make ordinary days extraordinary."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit the note" }).click();
  await page
    .getByLabel("A note at the end")
    .fill("A changed draft, never a changed gift.");
  await page.getByRole("button", { name: "Save & preview" }).click();
  await gift.reload();
  await complete(gift);
  await expect(
    gift.getByText("You make ordinary days extraordinary."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revoke this link" }).click();
  await gift.reload();
  await expect(
    gift.getByText("This gift link is no longer available."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page.getByRole("button", { name: "Yes, delete this project" }).click();
  await expect(page.getByRole("status")).toContainText("deleted");
  await recipient.close();
});
test("mocked generation persists task across refresh and approves actual stored GLB", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(page.getByText("TEST MODE · mocked provider")).toBeVisible();
  await page
    .getByLabel("Choose a drawing", { exact: true })
    .setInputFiles("public/sample-drawing.png");
  await page.getByRole("button", { name: "Save this drawing" }).click();
  await page.getByLabel("I’m an adult creator").check();
  await page
    .getByLabel("Creator access code", { exact: true })
    .fill("test-only-code");
  await page.getByRole("button", { name: "Unlock creation" }).click();
  await page.getByRole("button", { name: "Create 3D interpretation" }).click();
  const id = await page.evaluate(() => localStorage.getItem("dq_draft"));
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/projects/${id}`)).json()).job?.id,
    )
    .toBeTruthy();
  const before = await (await page.request.get(`/api/projects/${id}`)).json();
  await page.reload();
  await expect
    .poll(
      async () => {
        const p = await (await page.request.get(`/api/projects/${id}`)).json();
        return p.job?.status;
      },
      { timeout: 30000 },
    )
    .toBe("ready");
  const after = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(after.job.id).toBe(before.job.id);
  expect(after.job.providerId).toMatch(/^mock_/);
  expect(after.modelAsset).toBeTruthy();
  await page.getByRole("button", { name: "3 Meet your hero" }).click();
  await expect(
    page.getByRole("button", { name: "That’s my hero" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "That’s my hero" }).click();
  await expect(page.getByText("Make it unmistakably yours.")).toBeVisible();
});
test("invalid upload and failed model are explained without regeneration", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(page.getByText("TEST MODE · mocked provider")).toBeVisible();
  await page.getByLabel("Choose a drawing", { exact: true }).setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("this is not a PNG"),
  });
  await page.getByRole("button", { name: "Save this drawing" }).click();
  await expect(page.locator('.error-note[role="alert"]')).toContainText(
    "could not be read",
  );
  await page
    .getByRole("button", { name: "Try it with our Pip drawing" })
    .click();
  await expect(
    page.getByRole("button", { name: "That’s my hero" }),
  ).toBeEnabled();
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const p = await response.json();
    await route.fulfill({
      response,
      json: p.map((item: object) => ({
        ...item,
        source: "tripo",
        modelAsset: "broken",
        modelUrl: "/broken-model.glb",
      })),
    });
  });
  await page.route("**/broken-model.glb", (route) =>
    route.fulfill({
      status: 200,
      body: "not a model",
      contentType: "model/gltf-binary",
    }),
  );
  await page.reload();
  await expect(
    page.getByText("The stored model could not be opened.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "That’s my hero" }),
  ).toBeDisabled();
});
test("mobile creator and server rejects cross-origin and unauthorized assets", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create");
  await page
    .getByRole("button", { name: "Try it with our Pip drawing" })
    .click();
  await expect(
    page.getByRole("button", { name: "That’s my hero" }),
  ).toBeEnabled();
  await page.screenshot({
    path: `${evidence}/creator-mobile.png`,
    fullPage: true,
  });
  const p = await (await page.request.get("/api/projects")).json();
  const fresh = await browser.newContext();
  expect(
    (
      await fresh.request.get(`http://localhost:3107${p[0].drawingUrl}`)
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.patch(`/api/projects/${p[0].id}`, {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await fresh.close();
});
