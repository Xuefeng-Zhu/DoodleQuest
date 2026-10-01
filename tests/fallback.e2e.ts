import { test, expect } from "@playwright/test";
test("WebGL failure keeps a readable and completable gift", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (
        type === "webgl" ||
        type === "webgl2" ||
        type === "experimental-webgl"
      )
        return null;
      return original.call(this, type, ...(args as [])) as never;
    } as typeof original;
  });
  await page.goto("/example");
  await page.getByRole("button", { name: "Open my gift", exact: true }).click();
  await page.getByRole("button", { name: "Enter the little world" }).click();
  await expect(page.getByText(/3D.*(available|load)/).first()).toBeVisible();
  await page.getByRole("button", { name: "1 Bell gate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ring circle bell" }),
  ).toBeVisible();
  for (const b of ["circle", "triangle", "star"])
    await page
      .getByRole("button", { name: `Ring ${b} bell`, exact: true })
      .click();
  await page
    .getByRole("button", { name: "2 Star garden", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Collect the star" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Collect the star" }).click();
  await expect(
    page.locator('.game-bottom [data-dedication="carried"]'),
  ).toContainText("For all our little adventures");
  await page
    .getByRole("button", { name: "3 Gift mailbox", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deliver the star" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deliver the star" }).click();
  await page.getByRole("button", { name: "Open your letter" }).click();
  await expect(page.getByRole("heading", { name: "For You" })).toBeVisible();
  await expect(page.locator(".letter-sheet")).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-dedication="letter"]')).toContainText(
    "For all our little adventures",
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: "evidence/webgl-alternative.png" });
});
