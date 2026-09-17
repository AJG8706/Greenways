import { expect, test } from "@playwright/test";
import { adminApi } from "./helpers";

/**
 * Phase 5: approved media in the buyer walk. Seeds approved video assets for
 * intro / C1 approach / homesite (guardrail #3: the walk only ever selects
 * status='approved'), then exercises: preview on the welcome screen, the
 * skippable intro on start, the corner clip on arrival, and the homesite
 * clip on the done screen. Playback itself is not asserted (fixture bytes
 * aren't real video); presence + flow are.
 */

test.describe.configure({ mode: "serial" });

const FAKE_MP4 = Buffer.from("greenways e2e fixture — not a real video");

let propertyId: string;

test.beforeAll(async () => {
  const supabase = adminApi();
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("slug", "broussard-lot-4")
    .single();
  propertyId = property!.id;

  await supabase
    .from("media_assets")
    .delete()
    .eq("property_id", propertyId)
    .neq("type", "capture");

  for (const slot of ["intro", "corner_1_approach", "homesite"] as const) {
    const path = `${propertyId}/generated/e2e-${slot}.mp4`;
    const { error: upError } = await supabase.storage
      .from("property-photos")
      .upload(path, FAKE_MP4, { upsert: true, contentType: "video/mp4" });
    if (upError) throw new Error(`storage seed failed: ${upError.message}`);
    const { error } = await supabase.from("media_assets").insert({
      property_id: propertyId,
      type: "video",
      slot,
      storage_path: path,
      status: "approved",
    });
    if (error) throw new Error(`asset seed failed: ${error.message}`);
  }

  // An unapproved clip must never surface (guardrail #3): a rejected
  // entrance exists, and the walk should not offer an entrance chapter.
  const rejectedPath = `${propertyId}/generated/e2e-entrance-rejected.mp4`;
  await supabase.storage
    .from("property-photos")
    .upload(rejectedPath, FAKE_MP4, { upsert: true, contentType: "video/mp4" });
  await supabase.from("media_assets").insert({
    property_id: propertyId,
    type: "video",
    slot: "entrance",
    storage_path: rejectedPath,
    status: "rejected",
    reject_reason: "e2e fixture",
  });
});

test.afterAll(async () => {
  const supabase = adminApi();
  await supabase
    .from("media_assets")
    .delete()
    .eq("property_id", propertyId)
    .neq("type", "capture");
});

test("preview-the-walk plays the stitch order, approved chapters only", async ({ page }) => {
  await page.goto("/walk/broussard-lot-4?demo=clean");
  await expect(page.getByTestId("preview-walk")).toBeVisible();
  await page.getByTestId("preview-walk").click();

  await expect(page.getByTestId("preview-sheet")).toBeVisible();
  await expect(page.getByTestId("preview-chapter-intro")).toBeVisible();
  await expect(page.getByTestId("preview-chapter-c1")).toBeVisible();
  await expect(page.getByTestId("preview-chapter-homesite")).toBeVisible();
  // Rejected entrance never reaches a buyer.
  await expect(page.getByTestId("preview-chapter-entrance")).toHaveCount(0);

  await page.getByTestId("preview-chapter-c1").click();
  await expect(page.getByTestId("preview-player")).toBeVisible();

  await page.getByTestId("preview-go-onsite").click();
  await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
});

test("intro plays on start, is skippable, and the C1 clip rides the arrival card", async ({
  page,
}) => {
  await page.goto("/walk/broussard-lot-4?demo=clean");
  await page.getByTestId("start-walking").click();

  // Intro overlay first; skipping continues into the walk (demo → HUD).
  await expect(page.getByTestId("intro-overlay")).toBeVisible();
  await page.getByTestId("intro-skip").click();
  await expect(page.getByTestId("hud-arrow")).toBeVisible();

  // C1 has an approved approach clip — it appears on that arrival card.
  await page.getByTestId("demo-tray-toggle").click();
  for (let i = 0; i < 4; i++) {
    await page.getByTestId("demo-jump").click();
    await expect(page.getByTestId("arrival-card")).toBeVisible({ timeout: 20000 });
    const trackedC1 = (await page.getByTestId("arrival-card").textContent())?.includes(
      "Corner 1",
    );
    const clipCount = await page.getByTestId("arrival-clip").count();
    if (trackedC1) expect(clipCount).toBe(1);
    await page.getByTestId("arrival-next").click();
  }

  // Homesite clip waits on the done screen.
  await expect(page.getByTestId("done-title")).toBeVisible();
  await expect(page.getByTestId("homesite-clip")).toBeVisible();
});
