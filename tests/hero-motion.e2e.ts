import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { defaults } from "../src/domain/config";
import type { MotionJob } from "../src/components/HeroMotionControls";

mkdirSync("evidence", { recursive: true });
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterAll(() => {
  writeFileSync(
    "evidence/hero-motion-console.txt",
    errors.join("\n") ||
      "No uncaught application exceptions in hero motion tests. All provider output is explicitly mocked.",
  );
});

async function still(canvas: Locator) {
  // Give the current renderer frame time to observe the pause/reduced flag.
  await canvas.page().waitForTimeout(300);
  const before = await canvas.evaluate((element) => ({
    time: element.getAttribute("data-hero-animation-time"),
    pose: element.getAttribute("data-hero-pose"),
  }));
  expect(before.time).toBeTruthy();
  expect(before.pose).toBeTruthy();
  await canvas.page().waitForTimeout(650);
  expect(
    await canvas.evaluate((element) => ({
      time: element.getAttribute("data-hero-animation-time"),
      pose: element.getAttribute("data-hero-pose"),
    })),
  ).toEqual(before);
}
async function poseChanges(canvas: Locator) {
  const before = await canvas.getAttribute("data-hero-pose");
  expect(before).toBeTruthy();
  await expect
    .poll(() => canvas.getAttribute("data-hero-pose"))
    .not.toBe(before);
}
async function enter(page: Page) {
  await expect(page.locator("main")).toHaveAttribute(
    "data-scene-ready",
    "true",
  );
  await page.getByRole("button", { name: "Open my gift", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter the little world", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "1 Bell gate", exact: true }),
  ).toBeVisible();
}
test("mocked rigging resumes after reload and the same skinned hero walks and celebrates in the shared gift", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  let animationRequests = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/projects\/[^/]+\/animate$/.test(request.url())
    )
      animationRequests++;
  });
  await page.goto("/create");
  await expect(page.getByText("TEST MODE · mocked provider")).toBeVisible();
  await page
    .getByLabel("Choose a drawing", { exact: true })
    .setInputFiles("public/sample-drawing.png");
  await page
    .getByRole("button", { name: "Save this drawing", exact: true })
    .click();
  await page.getByLabel("I’m an adult creator").check();
  await page
    .getByLabel("Creator access code", { exact: true })
    .fill("test-only-code");
  await page
    .getByRole("button", { name: "Unlock creation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create 3D interpretation", exact: true })
    .click();
  const id = await page.evaluate(() => localStorage.getItem("dq_draft"));
  expect(id).toBeTruthy();
  const project = async () =>
    (await page.request.get(`/api/projects/${id}`)).json();
  await expect
    .poll(async () => (await project()).job?.status, { timeout: 30_000 })
    .toBe("ready");
  const original = await project();
  await page
    .getByRole("button", { name: "3 Meet your hero", exact: true })
    .click();
  const preview = page.locator("canvas");
  await expect(preview).toHaveAttribute("data-hero-kind", "fallback");
  const animate = page.getByRole("button", {
    name: "Bring my hero to life",
    exact: true,
  });
  await expect(animate).toBeDisabled();
  await page
    .getByLabel("I agree to use Tripo credits for rigging and animation.", {
      exact: true,
    })
    .check();
  // Lose the response after the server has durably accepted the request.
  // Reload/status recovery must find that same job, never reserve a second one.
  let accepted = false;
  await page.route("**/api/projects/*/animate", async (route) => {
    const response = await route.fetch();
    accepted = response.ok();
    await route.abort("failed");
  });
  await animate.click();
  await expect.poll(() => accepted).toBe(true);
  const started = await project();
  expect(started.motionJob.id).toBeTruthy();
  expect(started.motionJob.inputAsset).toBe(original.modelAsset);
  await expect(page.locator('.error-note[role="alert"]')).toContainText(
    "Check animation status",
  );
  await page
    .getByRole("button", { name: "Check animation status", exact: true })
    .click();
  await expect(
    page.locator('[aria-labelledby="hero-motion-heading"] .status-card'),
  ).toBeVisible();
  expect(animationRequests).toBe(1);
  await page.reload();
  await expect
    .poll(async () => (await project()).motionJob?.status, { timeout: 45_000 })
    .toBe("ready");
  const finished = await project();
  expect(finished.motionJob.id).toBe(started.motionJob.id);
  expect(finished.modelAsset).toBe(finished.motionJob.finalAsset);
  expect(finished.modelAsset).not.toBe(original.modelAsset);
  expect(finished.approved).toBe(0);
  expect(animationRequests).toBe(1);
  await expect(preview).toHaveAttribute("data-hero-kind", "clips");
  await expect(preview).toHaveAttribute("data-hero-skinned-meshes", "1");
  await expect(preview).toHaveAttribute("data-hero-clip", "preset:biped:idle");
  await poseChanges(preview);
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "evidence/hero-motion-preview-idle.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preview walk", exact: true }).click();
  await expect(preview).toHaveAttribute("data-hero-clip", "preset:biped:walk");
  await poseChanges(preview);
  await page
    .getByRole("button", { name: "Preview celebration", exact: true })
    .click();
  await expect(preview).toHaveAttribute("data-hero-clip", "preset:biped:cheer");
  await preview.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "evidence/hero-motion-preview-cheer.png",
    fullPage: true,
  });
  await expect(preview).toHaveAttribute("data-hero-motion", "idle");
  expect(animationRequests).toBe(1);

  await page
    .getByLabel("What’s your hero called?", { exact: true })
    .fill("Sprout");
  await page
    .getByRole("button", { name: "That’s my hero", exact: true })
    .click();
  await page.getByLabel("For someone special").fill("Jamie");
  await page
    .getByRole("button", { name: "Save & preview", exact: true })
    .click();
  const previewUrl = await page
    .getByRole("link", { name: "Play the whole adventure", exact: true })
    .getAttribute("href");
  expect(previewUrl).toBeTruthy();
  await page
    .getByRole("link", { name: "Play the whole adventure", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-hero-kind",
    "clips",
  );
  await page
    .getByRole("link", {
      name: "Creator preview · back to workshop",
    })
    .click();
  await page
    .getByRole("button", { name: "5 Preview & share", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Wrap this gift", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Seal & publish gift", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Wrapped for Jamie.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to my workshop", exact: true })
    .click();
  const giftUrl = await page
    .getByLabel("Gift link version 1", { exact: true })
    .inputValue();
  const recipient = await browser.newContext({
    baseURL: new URL(giftUrl).origin,
    viewport: { width: 1100, height: 820 },
  });
  const gift = await recipient.newPage();
  gift.on("pageerror", (error) => errors.push(error.message));
  const fetchedModels: string[] = [];
  gift.on("request", (request) => {
    if (
      new URL(request.url()).pathname === `/api/assets/${finished.modelAsset}`
    )
      fetchedModels.push(request.url());
  });
  await gift.goto(giftUrl);
  const token = new URL(giftUrl).pathname.split("/").at(-1);
  const shared = await (await gift.request.get(`/api/gifts/${token}`)).json();
  expect(new URL(shared.modelUrl, giftUrl).pathname).toBe(
    `/api/assets/${finished.modelAsset}`,
  );
  expect(
    (
      await recipient.request.post(`/api/projects/${id}/animate`, {
        headers: { origin: new URL(giftUrl).origin },
        data: { key: crypto.randomUUID(), consent: true, retry: false },
      })
    ).status(),
  ).toBe(401);
  const canvas = gift.locator("canvas");
  await expect(canvas).toHaveAttribute("data-hero-kind", "clips");
  await expect(canvas).toHaveAttribute("data-hero-skinned-meshes", "1");
  await enter(gift);
  // Simulate the browser visibility event without depending on headless tab focus.
  await gift.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await still(canvas);
  await gift.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await poseChanges(canvas);
  await gift.getByRole("button", { name: "1 Bell gate", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-hero-motion", "walk");
  await expect(canvas).toHaveAttribute("data-hero-clip", "preset:biped:walk");
  await poseChanges(canvas);
  await gift
    .getByRole("button", { name: "Pause and settings", exact: true })
    .click();
  await expect(gift.getByRole("dialog")).toBeVisible();
  await still(canvas);
  await gift.screenshot({ path: "evidence/hero-motion-walk-paused.png" });
  await gift
    .getByRole("button", { name: "Back to the adventure", exact: true })
    .click();
  await expect(
    gift.getByRole("button", { name: "Ring circle bell", exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-hero-motion", "idle");
  for (const shape of ["circle", "triangle", "star"]) {
    await gift
      .getByRole("button", { name: `Ring ${shape} bell`, exact: true })
      .click();
  }
  await expect(canvas).toHaveAttribute("data-hero-motion", "celebrate");
  await expect(canvas).toHaveAttribute("data-hero-cheers", "1");
  await gift.waitForTimeout(500);
  await gift.screenshot({ path: "evidence/hero-motion-gate-cheer.png" });
  await expect(canvas).toHaveAttribute("data-hero-motion", "idle");
  await gift.waitForTimeout(650);
  await expect(canvas).toHaveAttribute("data-hero-cheers", "1");
  await gift
    .getByRole("button", { name: "2 Star garden", exact: true })
    .click();
  await gift
    .getByRole("button", { name: "Collect the star", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-hero-cheers", "2");
  // Navigation interrupts the current one-shot; arriving must not replay it.
  await gift
    .getByRole("button", { name: "3 Gift mailbox", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-hero-motion", "walk");
  await gift
    .getByRole("button", { name: "Deliver the star", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-hero-cheers", "3");
  await expect(canvas).toHaveAttribute("data-hero-motion", "idle");
  await gift
    .getByRole("button", { name: "Open your letter", exact: true })
    .click();
  await gift.getByRole("button", { name: "Play again", exact: true }).click();
  await expect(
    gift.getByRole("button", { name: "Open my gift", exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-hero-motion", "idle");
  await expect(canvas).toHaveAttribute("data-hero-cheers", "0");
  expect(fetchedModels).toHaveLength(1);
  expect(errors).toEqual([]);
  await recipient.close();
});

test("a confirmed animation receipt survives failed status reads without offering another paid attempt", async ({
  page,
}) => {
  const id = "11111111-1111-4111-8111-111111111111";
  const modelAsset = "22222222-2222-4222-8222-222222222222";
  const animatedAsset = "33333333-3333-4333-8333-333333333333";
  const receipt: MotionJob = {
    id: "44444444-4444-4444-8444-444444444444",
    status: "pending",
    stage: "rig_check",
    progress: null,
    lastError: null,
    inputAsset: modelAsset,
    inputRevision: 1,
    finalAsset: null,
  };
  const project = {
    id,
    config: defaults,
    inputAsset: "55555555-5555-4555-8555-555555555555",
    revision: 1,
    modelAsset,
    source: "mock",
    approved: 0,
    drawingUrl: "/sample-drawing.png",
    modelUrl: "/hero-motion-static.glb",
    job: null,
    motionJob: null as MotionJob | null,
    shares: [],
  };
  let submissions = 0;
  let failedReads = 0;
  let blockReads = false;
  await page.addInitScript(
    (projectId) => localStorage.setItem("dq_draft", projectId),
    id,
  );
  await page.route("**/hero-motion-static.glb", (route) =>
    route.fulfill({
      body: readFileSync("tests/fixtures/mock.glb"),
      contentType: "model/gltf-binary",
    }),
  );
  await page.route("**/hero-motion-animated.glb", (route) =>
    route.fulfill({
      body: readFileSync("tests/fixtures/animated.glb"),
      contentType: "model/gltf-binary",
    }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/session")
      return route.fulfill({ json: { unlocked: true } });
    if (path === "/api/mode")
      return route.fulfill({ json: { mode: "mock", accessRequired: true } });
    if (path === "/api/projects") return route.fulfill({ json: [project] });
    if (path === `/api/projects/${id}/animate`) {
      submissions++;
      expect(route.request().postDataJSON()).toMatchObject({
        consent: true,
        retry: false,
      });
      project.motionJob = receipt;
      blockReads = true;
      return route.fulfill({ json: receipt });
    }
    if (path === `/api/projects/${id}`) {
      if (method === "GET" && blockReads) {
        failedReads++;
        return route.fulfill({
          status: 503,
          json: { error: "Test animation status temporarily unavailable." },
        });
      }
      if (method === "PATCH")
        project.config = {
          ...project.config,
          ...route.request().postDataJSON(),
        };
      return route.fulfill({ json: project });
    }
    return route.continue();
  });
  await page.goto("/create");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-hero-kind",
    "fallback",
  );
  await page
    .getByLabel("I agree to use Tripo credits for rigging and animation.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Bring my hero to life", exact: true })
    .click();
  const panel = page.locator('[aria-labelledby="hero-motion-heading"]');
  await expect(panel).toContainText("Checking which movements suit your hero");
  await expect(
    page.getByRole("button", { name: "Bring my hero to life", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Check animation status", exact: true })
    .click();
  await expect(page.locator('.error-note[role="alert"]')).toContainText(
    "Test animation status temporarily unavailable.",
  );
  expect(failedReads).toBeGreaterThan(0);
  expect(submissions).toBe(1);
  await expect(panel).toContainText("Checking which movements suit your hero");
  await expect(
    page.getByRole("button", {
      name: /^(Bring my hero to life|Try animation again)$/,
    }),
  ).toHaveCount(0);

  project.motionJob = {
    ...receipt,
    status: "ready",
    stage: "retarget",
    progress: 100,
    finalAsset: animatedAsset,
  };
  project.modelAsset = animatedAsset;
  project.modelUrl = "/hero-motion-animated.glb";
  blockReads = false;
  await page
    .getByRole("button", { name: "Check animation status", exact: true })
    .click();
  await expect(panel).toContainText(
    "Your hero’s motion is ready. Preview it, then approve your hero again.",
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-hero-kind",
    "clips",
  );
  await expect(
    page.getByRole("button", { name: "That’s my hero", exact: true }),
  ).toBeEnabled();
  expect(submissions).toBe(1);
  expect(errors).toEqual([]);
});

test("procedural Pip has visible limb motion and mobile pause and reduced motion keep the pose still", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/example");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-hero-kind", "procedural");
  await enter(page);
  await page.getByRole("button", { name: "1 Bell gate", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-hero-motion", "walk");
  await poseChanges(canvas);
  await page
    .getByRole("button", { name: "Pause and settings", exact: true })
    .click();
  await still(canvas);
  await page.screenshot({
    path: "evidence/hero-motion-procedural-mobile-paused.png",
  });
  await page.getByLabel("Reduce motion", { exact: true }).check();
  await page
    .getByRole("button", { name: "Back to the adventure", exact: true })
    .click();
  await expect(page.locator("main")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Ring circle bell", exact: true }),
  ).toBeVisible();
  await still(canvas);
  for (const shape of ["circle", "triangle", "star"]) {
    await page
      .getByRole("button", { name: `Ring ${shape} bell`, exact: true })
      .click();
  }
  await expect(canvas).toHaveAttribute("data-hero-motion", "idle");
  await expect(canvas).toHaveAttribute("data-hero-cheers", "0");
  await still(canvas);
  await page.screenshot({
    path: "evidence/hero-motion-procedural-mobile-reduced.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Turning motion back on must not play the reaction skipped while reduced.
  await page
    .getByRole("button", { name: "Pause and settings", exact: true })
    .click();
  await page.getByLabel("Reduce motion", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Back to the adventure", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-hero-cheers", "0");
  await poseChanges(canvas);
  await page
    .getByRole("button", { name: "2 Star garden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Collect the star", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-hero-motion", "celebrate");
  await page.waitForTimeout(450);
  await page.screenshot({
    path: "evidence/hero-motion-procedural-mobile-cheer.png",
  });
  expect(errors).toEqual([]);
});
