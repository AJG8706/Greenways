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
  await page.getByTestId("lock-corners").click();
  await expect(page.getByTestId("unlock-corners")).toBeVisible();

  // Re-import while locked must refuse (guardrail #2).
  await expect(page.getByTestId("import-kml")).toBeDisabled();
});

test("assemble: KML attached at creation imports corners in the same step", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);

  await page.getByTestId("new-property").click();
  await page.getByRole("textbox").first().fill("E2E Assemble Lot");
  await page.getByPlaceholder("Jefferson").fill("Jefferson");
  await page.getByTestId("new-property-kml").setInputFiles(KML_PATH);
  await page.getByTestId("create-property").click();
  await expect(page.getByTestId("property-title")).toHaveText("E2E Assemble Lot");

  // Overview checklist: geometry landed with creation, verify is the next step.
  await expect(page.getByTestId("assembly-checklist")).toBeVisible();
  await expect(page.getByTestId("stage-geometry")).toHaveText(/done/i);
  await expect(page.getByTestId("stage-verify")).toHaveText(/next/i);
  await expect(page.getByTestId("next-step")).toContainText(/lock/i);

  await page.getByTestId("tab-corners").click();
  await expect(page.getByTestId("corners-table").locator("tbody tr")).toHaveCount(4);
});

test("photos tab records a property capture (upload twice = replace)", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("link", { name: E2E_PROPERTY }).click();
  await page.getByTestId("tab-photos").click();

  const tinyJpeg = {
    name: "aerial.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
        "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
        "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
      "base64",
    ),
  };

  await expect(page.getByTestId("photo-state-aerial")).toContainText(/missing/i);
  await page.getByTestId("photo-input-aerial").setInputFiles(tinyJpeg);
  await expect(page.getByTestId("photo-state-aerial")).toContainText(/ready/i, {
    timeout: 15_000,
  });

  // Second upload replaces the capture row (the old upsert 500'd here:
  // ON CONFLICT cannot match the partial capture unique index).
  await page.getByTestId("photo-input-aerial").setInputFiles(tinyJpeg);
  await expect(page.locator(".banner-error")).toHaveCount(0);
  await expect(page.getByTestId("photo-state-aerial")).toContainText(/ready/i);
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

  // First-ever sign-in lands on the welcome explaining the link-is-your-sign-in
  // model (the invite email confused people expecting a confirmation step).
  await expect(page.getByTestId("welcome-card")).toBeVisible();
  await expect(page.getByTestId("welcome-card")).toContainText(/no password/i);

  await page.getByRole("link", { name: E2E_PROPERTY }).click();
  await page.getByTestId("tab-content").click();
  await page.getByRole("textbox").first().fill(`${E2E_PROPERTY} (edited)`);
  await page.getByTestId("save-content").click();
  await expect(page.getByRole("status")).toContainText(/saved/i);

  // Corners are locked; editors get no unlock affordance (admin-only, DB-enforced).
  await page.getByTestId("tab-corners").click();
  await expect(page.getByTestId("corners-table")).toBeVisible();
  await expect(page.getByTestId("unlock-corners")).toHaveCount(0);

  // The activity trail is admin-only: no nav entry, and the page bounces.
  await expect(page.getByRole("link", { name: "Activity" })).toHaveCount(0);
  await page.goto("/admin/activity");
  await expect(page).toHaveURL(/\/admin\/properties/);
});

test("activity page shows sign-ins and the audit trail (admin only)", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("link", { name: "Activity" }).click();

  // Sign-ins land in the trail via /auth/confirm, so this very session shows.
  const signIns = page.getByTestId("sign-ins-card");
  await expect(signIns).toContainText(new RegExp(ADMIN_EMAIL.split("@")[0]!, "i"), {
    timeout: 15_000,
  });
  await expect(signIns).toContainText(/last signed in/i);

  // Earlier tests locked corners and imported KML — those actions are here,
  // attributed and readable.
  const table = page.getByTestId("activity-table");
  await expect(table).toContainText("Signed in");
  await expect(table).toContainText("Imported KML geometry");
  await expect(table).toContainText("Locked a corner");
});

test("publish stays blocked while Spanish is unreviewed", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("link", { name: new RegExp(E2E_PROPERTY) }).click();
  await page.getByTestId("tab-publish").click();
  await expect(page.getByTestId("publish-blocked")).toBeVisible();
});

test("demo mode is off by default and gates the simulated walk scenarios", async ({
  page,
}) => {
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("link", { name: new RegExp(E2E_PROPERTY) }).click();
  await page.getByTestId("tab-demo").click();

  // A newly created property is live-GPS only: no simulation offered.
  await expect(page.getByTestId("live-gps-banner")).toBeVisible();
  await expect(page.getByTestId("launch-demo-clean")).toHaveCount(0);
  await expect(page.getByTestId("launch-live-walk")).toHaveAttribute(
    "href",
    /\/walk\/[^?]+$/,
  );

  // Turning demo mode on brings up the scenario launchers, without a reload.
  await page.getByTestId("demo-mode-toggle").click();
  // Button asChild puts the testid on the anchor itself.
  await expect(page.getByTestId("launch-demo-clean")).toHaveAttribute(
    "href",
    /\/walk\/.+\?demo=clean/,
  );
  await expect(page.getByTestId("launch-demo-boundary")).toBeVisible();
  await expect(page.getByTestId("live-gps-banner")).toHaveCount(0);
});
