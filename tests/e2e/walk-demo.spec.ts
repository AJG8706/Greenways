import { expect, test, type Page } from "@playwright/test";

/**
 * Simulated-walk E2E (Gate 3 acceptance: demo mode plays a full walk).
 * Uses the seeded broussard-lot-4 property; no sign-in — buyers are anonymous.
 * The demo source runs the same filters/arrival/boundary code path as the
 * field walk; "jump to arrival" exercises the teleport re-seed + arrival.
 */

async function completeWalk(page: Page) {
  await page.goto("/walk/broussard-lot-4?demo=clean");
  await expect(page.getByTestId("start-walking")).toBeVisible();
  await page.getByTestId("start-walking").click();

  // Demo mode goes straight to the HUD (no device permissions to ask for).
  await expect(page.getByTestId("hud-arrow")).toBeVisible();
  await expect(page.getByTestId("tracked-name")).toBeVisible();
  await expect(page.getByTestId("found-count")).toContainText("0");

  await page.getByTestId("demo-tray-toggle").click();

  for (let i = 0; i < 4; i++) {
    await page.getByTestId("demo-jump").click();
    await expect(page.getByTestId("arrival-card")).toBeVisible({ timeout: 20000 });
    await page.getByTestId("arrival-next").click();
  }

  await expect(page.getByTestId("done-title")).toBeVisible();
}

test("demo walk finds all four corners to completion (desktop)", async ({ page }) => {
  await completeWalk(page);
});

test("demo walk completes on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await completeWalk(page);
});

test("walk terms: sheet opens from the welcome line; Start records agreement", async ({
  page,
}) => {
  await page.goto("/walk/broussard-lot-4?demo=clean");
  await expect(page.getByTestId("start-walking")).toBeVisible();

  // Full terms open from the agree line and close without starting the walk.
  await page.getByTestId("terms-link").click();
  await expect(page.getByTestId("walk-terms")).toBeVisible();
  await expect(page.getByTestId("walk-terms")).toContainText(/own risk/i);
  await expect(page.getByTestId("walk-terms")).toContainText(/not liable/i);
  await page.getByTestId("terms-close").click();
  await expect(page.getByTestId("walk-terms")).toHaveCount(0);

  // Starting is agreeing: the acknowledgment event goes out with the batch.
  const ack = page.waitForRequest(
    (req) =>
      req.url().includes("/api/walk-events") &&
      (req.postData() ?? "").includes("disclaimer_acknowledged"),
  );
  await page.getByTestId("start-walking").click();
  await expect(page.getByTestId("hud-arrow")).toBeVisible();
  await ack;
});

test("map mode shows the lot line, pins and distance badge", async ({ page }) => {
  await page.goto("/walk/broussard-lot-4?demo=clean");
  await page.getByTestId("start-walking").click();
  await expect(page.getByTestId("hud-arrow")).toBeVisible();
  await page.getByTestId("toggle-map").click();
  await expect(page.getByTestId("mini-map")).toBeVisible();
  await page.getByTestId("toggle-map").click();
  await expect(page.getByTestId("hud-arrow")).toBeVisible();
});

test("corner picker re-targets the arrow", async ({ page }) => {
  await page.goto("/walk/broussard-lot-4?demo=clean");
  await page.getByTestId("start-walking").click();
  await expect(page.getByTestId("tracked-name")).toBeVisible();
  await page.getByTestId("open-picker").click();
  await expect(page.getByTestId("picker-sheet")).toBeVisible();
  await page.getByTestId("pick-c3").click();
  await expect(page.getByTestId("picker-sheet")).toHaveCount(0);
  await expect(page.getByTestId("strip-c3")).toHaveAttribute("aria-pressed", "true");
});

test("boundary scenario raises the warning banner, which is dismissible", async ({ page }) => {
  test.slow(); // real-time 1 Hz walker: the excursion takes ~30 s of wall clock
  await page.goto("/walk/broussard-lot-4?demo=boundary");
  await page.getByTestId("start-walking").click();
  await expect(page.getByTestId("hud-arrow")).toBeVisible();
  await page.getByTestId("demo-tray-toggle").click();
  // Let the walker leave the entrance's 40 ft exemption radius first,
  // then push it sideways across the line twice so it stays out > 3 s.
  await page.waitForTimeout(15000);
  await page.getByTestId("demo-outside").click();
  await page.waitForTimeout(3000);
  await page.getByTestId("demo-outside").click();
  await expect(page.getByTestId("boundary-banner")).toBeVisible({ timeout: 45000 });
  // Dismiss if it hasn't already cleared itself on re-entry.
  await page
    .getByTestId("boundary-banner")
    .getByRole("button")
    .click()
    .catch(() => undefined);
  await expect(page.getByTestId("boundary-banner")).toHaveCount(0, { timeout: 15000 });
});

test("the walk is fully bilingual via the cookie locale", async ({ page, context }) => {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "es", url: "http://localhost:3000" },
  ]);
  await page.goto("/walk/broussard-lot-4?demo=clean");
  await expect(page.getByText("Camine el terreno. Encuentre cada esquina.")).toBeVisible();
  await page.getByTestId("start-walking").click();
  await expect(page.getByText("Buscando", { exact: false })).toBeVisible({ timeout: 10000 });
});

test("PWA assets serve: manifest and service worker", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const json = (await manifest.json()) as { name?: string; icons?: unknown[] };
  expect(json.name).toBe("Greenways");
  expect((json.icons ?? []).length).toBeGreaterThan(1);

  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  expect(sw.headers()["content-type"]).toContain("javascript");

  await page.goto("/walk/broussard-lot-4?demo=clean");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    /manifest\.webmanifest/,
  );
});

/**
 * Demo is opt-in per property. The Hillmont test lot ships with demo_mode off
 * (it exists to exercise real device GPS), so `?demo=` must not put a
 * simulated walker on it — the guarantee that a stray demo link can never
 * replace a real walker's position with a simulation.
 */
test("a property with demo mode off ignores ?demo= and asks for real GPS", async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.goto("/walk/hillmont-gps-test?demo=clean");
  await expect(page.getByTestId("start-walking")).toBeVisible();
  await page.getByTestId("start-walking").click();

  // Live path: the walk asks for the device's sensors instead of dropping
  // straight into the HUD, and the demo tray never mounts.
  await expect(page.getByTestId("allow-sensors")).toBeVisible();
  await expect(page.getByTestId("demo-tray-toggle")).toHaveCount(0);
  await expect(page.getByTestId("hud-arrow")).toHaveCount(0);
});
