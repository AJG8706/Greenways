import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, adminApi, signIn } from "./helpers";

/**
 * Field use: the admin console on a phone. The shell folds into a top bar
 * with a scrollable nav, and an unlocked corner can take the device's own
 * GPS fix — stand on the stake, press the button.
 */

test.describe.configure({ mode: "serial" });

test.use({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 30.2001, longitude: -94.2001 },
  permissions: ["geolocation"],
});

const SLUG = "e2e-mobile-corners";
let propertyId: string;

test.beforeAll(async () => {
  const supabase = adminApi();
  await supabase.from("properties").delete().eq("slug", SLUG);
  const { data: property, error } = await supabase
    .from("properties")
    .insert({
      slug: SLUG,
      name: { en: "E2E Mobile Lot", es: "Lote móvil" },
      county: "Jefferson",
      entrance_lat: 30.1745,
      entrance_lng: -94.196,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  propertyId = property.id;

  const { error: cornersError } = await supabase.from("corners").insert(
    [
      { n: 1, lat: 30.1745, lng: -94.1965 },
      { n: 2, lat: 30.1745, lng: -94.1955 },
      { n: 3, lat: 30.1738, lng: -94.1955 },
      { n: 4, lat: 30.1738, lng: -94.1965 },
    ].map((c) => ({ property_id: propertyId, ...c, locked: false })),
  );
  if (cornersError) throw new Error(cornersError.message);
});

test.afterAll(async () => {
  await adminApi().from("properties").delete().eq("slug", SLUG);
});

test("the console works at phone width without sideways scrolling", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await expect(page.getByTestId("properties-table")).toBeVisible();

  // Top-bar shell: nav links reachable, sign out present on the bar.
  await expect(page.getByRole("link", { name: "Properties" })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();

  // Tables live in their own scroll containers; the page itself never pans.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);

  // The property editor (tab row + corners table) holds at phone width too.
  await page.goto(`/admin/properties/${propertyId}`);
  await page.getByTestId("tab-corners").click();
  await expect(page.getByTestId("corners-table")).toBeVisible();
  const editorOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(editorOverflow).toBeLessThanOrEqual(2);
});

test("an unlocked corner takes the device's GPS fix, with accuracy shown", async ({
  page,
}) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/admin/properties/${propertyId}`);
  await page.getByTestId("tab-corners").click();

  await page.getByTestId("gps-corner-1").click();
  await expect(page.getByTestId("gps-note")).toContainText(/C1 .*±\d+ ft/, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("corners-table")).toContainText("30.200100", {
    timeout: 15_000,
  });

  // Locking removes the capture buttons: locked corners never move.
  await page.getByTestId("lock-corners").click();
  await expect(page.getByTestId("gps-corner-1")).toHaveCount(0, { timeout: 15_000 });
});
