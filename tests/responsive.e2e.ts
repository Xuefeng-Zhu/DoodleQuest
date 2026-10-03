import { expect, test, type Page } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

async function expectButtonInViewport(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  return button;
}

async function clickInViewport(page: Page, name: string) {
  const button = await expectButtonInViewport(page, name);
  await expect(button).toBeEnabled();
  await button.click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

async function expectDestinationsInViewport(page: Page) {
  for (const name of ["1 Bell gate", "2 Star garden", "3 Gift mailbox"])
    await expectButtonInViewport(page, name);
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
]) {
  test(`quest controls remain reachable without scrolling at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/example");

    // Check before clicking: Playwright would otherwise scroll hidden controls
    // into view and silently hide a short-screen layout regression.
    await expect(
      page.getByRole("switch", { name: "Gentle sounds", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await clickInViewport(page, "Open my gift");
    await clickInViewport(page, "Enter the little world");
    await expectDestinationsInViewport(page);
    await clickInViewport(page, "1 Bell gate");

    for (const bell of ["circle", "triangle", "star"])
      await expectButtonInViewport(page, `Ring ${bell} bell`);
    await expectDestinationsInViewport(page);
    for (const bell of ["circle", "triangle", "star"])
      await clickInViewport(page, `Ring ${bell} bell`);

    await clickInViewport(page, "2 Star garden");
    await clickInViewport(page, "Collect the star");
    await expectDestinationsInViewport(page);
    await clickInViewport(page, "3 Gift mailbox");
    await clickInViewport(page, "Deliver the star");

    await page.getByRole("button", { name: "Open your letter" }).click();
    await expect(page.locator(".personal-message")).toBeVisible();
    await page.getByRole("button", { name: "Play again" }).click();
    await expectButtonInViewport(page, "Open my gift");
  });
}

test("opening copy and scene do not overlap at tablet width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 650 });
  await page.goto("/example");
  await expectButtonInViewport(page, "Open my gift");

  const opening = await page.locator(".gift-opening").boundingBox();
  const scene = await page.locator(".game-scene").boundingBox();
  expect(opening).not.toBeNull();
  expect(scene).not.toBeNull();
  const overlaps =
    opening!.x < scene!.x + scene!.width &&
    opening!.x + opening!.width > scene!.x &&
    opening!.y < scene!.y + scene!.height &&
    opening!.y + opening!.height > scene!.y;
  expect(overlaps, "The scene must leave the opening text unobscured").toBe(
    false,
  );
});

test("reveal drawing does not obscure the heading above the landscape breakpoint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 761, height: 601 });
  await page.goto("/example");
  await clickInViewport(page, "Open my gift");
  await expectButtonInViewport(page, "Enter the little world");

  const heading = await page.locator(".reveal-heading").boundingBox();
  const drawing = await page.locator(".reveal-drawing").boundingBox();
  expect(heading).not.toBeNull();
  expect(drawing).not.toBeNull();
  const overlaps =
    heading!.x < drawing!.x + drawing!.width &&
    heading!.x + heading!.width > drawing!.x &&
    heading!.y < drawing!.y + drawing!.height &&
    heading!.y + heading!.height > drawing!.y;
  expect(overlaps, "The drawing must leave the reveal heading unobscured").toBe(
    false,
  );
});
