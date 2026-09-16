import { expect, test } from "@playwright/test";
import path from "node:path";
import { ADMIN_EMAIL, adminApi, signIn } from "./helpers";

const KML_PATH = path.join(__dirname, "../../data/lot4_gaines_acres.kml");
const EDITOR_EMAIL = "e2e-editor@texasgreenerpastures.com";
const E2E_PROPERTY = "E2E Broussard Lot 4";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Clean slate for re-runs.
  const supabase = adminApi();
  await supabase.from("properties").delete().ilike("slug", "e2e-%");
  await supabase.from("invites").delete().eq("email", EDITOR_EMAIL);
  const { data: users } = await supabase.auth.admin.listUsers();
  for (const u of users?.users ?? []) {
    if (u.email === EDITOR_EMAIL) await supabase.auth.admin.deleteUser(u.id);
  }
  await supabase.from("team_users").delete().eq("email", EDITOR_EMAIL);
});

test("uninvited email is turned away at sign-in", async ({ page }) => {
  await page.goto("/admin/sign-in");
  await page.getByRole("textbox").fill("stranger@example.com");
  await page.getByRole("button", { name: /sign-in link/i }).click();
  // Not getByRole("alert"): Next's route announcer is also role=alert.
  await expect(page.locator(".banner-warn")).toContainText(/isn't on the team/i);
});

test("invited admin signs in via magic link", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/admin\/properties/);
  await expect(page.getByTestId("properties-table")).toBeVisible();
});

test("create property → import KML → corners numbered clockwise from entrance", async ({
  page,
}) => {
  await signIn(page, ADMIN_EMAIL);

  await page.getByTestId("new-property").click();
  await page.getByRole("textbox").first().fill(E2E_PROPERTY);
  await page.getByPlaceholder("Jefferson").fill("Jefferson");
  await page.getByTestId("create-property").click();
  await expect(page.getByTestId("property-title")).toHaveText(E2E_PROPERTY);

  await page.getByTestId("tab-corners").click();
  await page.getByTestId("kml-input").setInputFiles(KML_PATH);

  const table = page.getByTestId("corners-table");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(table).toContainText("C1");
  await expect(table).toContainText("C4");
  await expect(page.getByTestId("entrance-coords")).toBeVisible();
  await expect(page.getByTestId("drawn-map")).toBeVisible();

  // Import defaults the entrance to the first edge (KML order starts at NE),
  // so C1 = NE until the entrance is confirmed.
  const firstRow = table.locator("tbody tr").first();
  await expect(firstRow).toContainText("30.1737");
  await expect(firstRow).toContainText("-94.1956");

  // Move the entrance to the Broussard Rd frontage (top of the drawn map):
  // numbering re-derives to the Gate 1 layout, C1 = NW (30.173932, −94.196061).
  await page.getByRole("button", { name: "Move entrance" }).click();
  const map = page.getByTestId("drawn-map");
  const box = await map.boundingBox();
  if (!box) throw new Error("drawn map not visible");
  await map.click({ position: { x: box.width / 2, y: box.height * 0.09 } });
  await expect(firstRow).toContainText("30.1739");
  await expect(firstRow).toContainText("-94.1960");

  // Verify and lock (CAD-verified); as admin the unlock action appears.
  await page.getByRole("button", { name: "CAD-verified", exact: true }).click();
  await expect(page.getByTestId("unlock-corners")).toBeVisible();

  // Re-import while locked must refuse (guardrail #2).
  await expect(page.getByTestId("import-kml")).toBeDisabled();
});

test("admin invites a second team member from the Team tab", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/admin/team");
  await page.getByTestId("invite-email").fill(EDITOR_EMAIL);
  await page.getByTestId("invite-role").selectOption("editor");
  await page.getByTestId("send-invite").click();
  await expect(page.getByTestId("team-table")).toContainText(EDITOR_EMAIL);
});

test("invited editor signs in and edits content, but cannot unlock corners", async ({
  page,
}) => {
  await signIn(page, EDITOR_EMAIL);
  await expect(page).toHaveURL(/\/admin\/properties/);

  await page.getByRole("link", { name: E2E_PROPERTY }).click();
  await page.getByTestId("tab-content").click();
  await page.getByRole("textbox").first().fill(`${E2E_PROPERTY} (edited)`);
  await page.getByTestId("save-content").click();
  await expect(page.getByRole("status")).toContainText(/saved/i);

  // Corners are locked; editors get no unlock affordance (admin-only, DB-enforced).
  await page.getByTestId("tab-corners").click();
  await expect(page.getByTestId("corners-table")).toBeVisible();
  await expect(page.getByTestId("unlock-corners")).toHaveCount(0);
});

test("publish stays blocked while Spanish is unreviewed", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("link", { name: new RegExp(E2E_PROPERTY) }).click();
  await page.getByTestId("tab-publish").click();
  await expect(page.getByTestId("publish-blocked")).toBeVisible();
});

test("demo tab launches the simulated walk scenarios", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("link", { name: new RegExp(E2E_PROPERTY) }).click();
  await page.getByTestId("tab-demo").click();
  // Button asChild puts the testid on the anchor itself.
  await expect(page.getByTestId("launch-demo-clean")).toHaveAttribute(
    "href",
    /\/walk\/.+\?demo=clean/,
  );
  await expect(page.getByTestId("launch-demo-boundary")).toBeVisible();
});
