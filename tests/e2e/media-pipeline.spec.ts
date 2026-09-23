import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, adminApi, signIn } from "./helpers";

/**
 * Phase 4 media pipeline against the mock provider (HIGGSFIELD_API_KEY unset
 * in CI): brief → generate → poll/ingest → review → reject-regenerates →
 * approve → style lock opens the corner batch. Same code path as the real
 * provider; only the HTTP calls are swapped.
 */

test.describe.configure({ mode: "serial" });

// 1x1 white JPEG.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

let propertyId: string;

test.beforeAll(async () => {
  const supabase = adminApi();
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("slug", "broussard-lot-4")
    .single();
  propertyId = property!.id;

  // Clean slate: no jobs, no generated assets, fresh captures for the slots
  // this test exercises (aerial+gate → intro, gate → entrance, C1 photos).
  await supabase.from("generation_jobs").delete().eq("property_id", propertyId);
  await supabase
    .from("media_assets")
    .delete()
    .eq("property_id", propertyId)
    .neq("type", "capture");
  await supabase
    .from("media_assets")
    .delete()
    .eq("property_id", propertyId)
    .eq("type", "capture")
    .in("slot", ["aerial", "gate"]);

  for (const slot of ["aerial", "gate"] as const) {
    const path = `${propertyId}/property/${slot}.jpg`;
    const { error: upError } = await supabase.storage
      .from("property-photos")
      .upload(path, TINY_JPEG, { upsert: true, contentType: "image/jpeg" });
    if (upError) throw new Error(`storage seed failed: ${upError.message}`);
    const { error } = await supabase.from("media_assets").insert({
      property_id: propertyId,
      type: "capture",
      slot,
      storage_path: path,
    });
    if (error) throw new Error(`capture seed failed: ${error.message}`);
  }

  for (const slot of ["approach", "stake"] as const) {
    const path = `${propertyId}/corners/c1-${slot}.jpg`;
    const { error: upError } = await supabase.storage
      .from("property-photos")
      .upload(path, TINY_JPEG, { upsert: true, contentType: "image/jpeg" });
    if (upError) throw new Error(`storage seed failed: ${upError.message}`);
  }
  await supabase
    .from("corners")
    .update({
      approach_photo: `${propertyId}/corners/c1-approach.jpg`,
      stake_photo: `${propertyId}/corners/c1-stake.jpg`,
    })
    .eq("property_id", propertyId)
    .eq("n", 1);
});

async function openMediaTab(page: Page) {
  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/admin/properties/${propertyId}`);
  await page.getByTestId("tab-media").click();
  await expect(page.getByTestId("media-slots")).toBeVisible();
}

/** Poll the provider until the slot leaves the generating state. */
async function pollUntilReview(page: Page, slot: string) {
  await expect(async () => {
    await page.getByTestId("refresh-jobs").click();
    await expect(page.getByTestId(`slot-${slot}-state`)).toHaveText(/in review/i, {
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
}

async function approveCurrentReview(page: Page, slot: string) {
  const card = page.locator('[data-testid^="review-"]').first();
  await expect(card).toBeVisible();
  await card.locator('[data-testid^="approve-"]').click();
  await expect(page.getByTestId(`slot-${slot}-state`)).toHaveText(/approved/i, {
    timeout: 15_000,
  });
}

test("mock banner, slot readiness, and the style lock gate", async ({ page }) => {
  await openMediaTab(page);

  await expect(page.getByTestId("mock-banner")).toBeVisible();
  await expect(page.getByTestId("slot-intro-state")).toHaveText(/ready/i);
  await expect(page.getByTestId("slot-entrance-state")).toHaveText(/ready/i);
  // Homesite photo was never uploaded: missing sources, not style lock alone.
  await expect(page.getByTestId("slot-homesite-state")).toHaveText(/missing/i);
  // C1 has photos but the style is not locked yet.
  await expect(page.getByTestId("slot-corner_1_approach-state")).toHaveText(/ready/i);
  await expect(page.getByTestId("generate-corner_1_approach")).toBeDisabled();
  await expect(page.getByTestId("slot-corner_1_approach")).toContainText(/style lock/i);
});

test("generate intro → poll → review appears with source beside clip", async ({ page }) => {
  await openMediaTab(page);

  await page.getByTestId("generate-intro").click();
  await expect(page.getByTestId("slot-intro-state")).toHaveText(/generating/i, {
    timeout: 15_000,
  });

  await pollUntilReview(page, "intro");
  const card = page.locator('[data-testid^="review-"]').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(/intro/i);
  await expect(card.locator("img")).toHaveCount(2); // mock emits an image + source photo
});

test("reject with reason regenerates from the same job; approve fills the slot", async ({
  page,
}) => {
  await openMediaTab(page);

  // Reject: back to generating (auto re-queue, same spec, new seed).
  const card = page.locator('[data-testid^="review-"]').first();
  await card.locator('[data-testid^="reject-note-"]').fill("horizon tilts left");
  await card.getByRole("button", { name: /reject/i }).click();
  await expect(page.getByTestId("slot-intro-state")).toHaveText(/generating/i, {
    timeout: 15_000,
  });

  // The rejection is recorded with its reason, and a fresh job runs.
  const supabase = adminApi();
  const { data: rejected } = await supabase
    .from("media_assets")
    .select("status, reject_reason")
    .eq("property_id", propertyId)
    .eq("slot", "intro")
    .eq("status", "rejected");
  expect(rejected?.length).toBe(1);
  expect(rejected![0]!.reject_reason).toMatch(/horizon tilts left/);

  await pollUntilReview(page, "intro");
  await approveCurrentReview(page, "intro");
});

test("approving intro + entrance unlocks the corner batch", async ({ page }) => {
  await openMediaTab(page);

  // Intro alone is not enough.
  await expect(page.getByTestId("generate-corner_1_approach")).toBeDisabled();

  await page.getByTestId("generate-entrance").click();
  await expect(page.getByTestId("slot-entrance-state")).toHaveText(/generating/i, {
    timeout: 15_000,
  });
  await pollUntilReview(page, "entrance");
  await approveCurrentReview(page, "entrance");

  // Style locked: the C1 approach can now spend credits.
  await expect(page.getByTestId("generate-corner_1_approach")).toBeEnabled();
  await page.getByTestId("generate-corner_1_approach").click();
  await expect(page.getByTestId("slot-corner_1_approach-state")).toHaveText(/generating/i, {
    timeout: 15_000,
  });

  // Job payload kept the same source frames for any future regeneration.
  const supabase = adminApi();
  const { data: job } = await supabase
    .from("generation_jobs")
    .select("payload, slot")
    .eq("property_id", propertyId)
    .eq("slot", "corner_1_approach")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const payload = job!.payload as { sourcePaths?: string[]; prompt?: string };
  expect(payload.sourcePaths).toEqual([
    `${propertyId}/corners/c1-approach.jpg`,
    `${propertyId}/corners/c1-stake.jpg`,
  ]);
  expect(payload.prompt).toContain("surveyor's corner stake");
});

test("upload your own clip fills a slot; remove clears it", async ({ page }) => {
  await openMediaTab(page);

  // Homesite has no source photo uploaded in this suite — uploads don't
  // need one (own footage bypasses generation entirely).
  await expect(page.getByTestId("slot-homesite-state")).toHaveText(/missing/i);
  await page.getByTestId("upload-homesite").setInputFiles({
    name: "homesite.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("e2e fixture — not a real video"),
  });
  await expect(page.getByTestId("slot-homesite-state")).toHaveText(/approved/i, {
    timeout: 15_000,
  });

  // Remove is a two-tap confirm; the slot falls back to its photo state.
  await page.getByTestId("remove-homesite").click();
  await page.getByTestId("remove-homesite").click();
  await expect(page.getByTestId("slot-homesite-state")).toHaveText(/missing/i, {
    timeout: 15_000,
  });
});

test("Generate remaining queues every ready slot in one click", async ({ page }) => {
  // Seed the sources that were deliberately missing above, so homesite and
  // the C2 approach become ready while C3/C4 stay missing.
  const supabase = adminApi();
  await supabase
    .from("media_assets")
    .delete()
    .eq("property_id", propertyId)
    .eq("type", "capture")
    .eq("slot", "homesite");
  const homesitePath = `${propertyId}/property/homesite.jpg`;
  await supabase.storage
    .from("property-photos")
    .upload(homesitePath, TINY_JPEG, { upsert: true, contentType: "image/jpeg" });
  await supabase.from("media_assets").insert({
    property_id: propertyId,
    type: "capture",
    slot: "homesite",
    storage_path: homesitePath,
  });
  for (const slot of ["approach", "stake"] as const) {
    await supabase.storage
      .from("property-photos")
      .upload(`${propertyId}/corners/c2-${slot}.jpg`, TINY_JPEG, {
        upsert: true,
        contentType: "image/jpeg",
      });
  }
  await supabase
    .from("corners")
    .update({
      approach_photo: `${propertyId}/corners/c2-approach.jpg`,
      stake_photo: `${propertyId}/corners/c2-stake.jpg`,
    })
    .eq("property_id", propertyId)
    .eq("n", 2);

  await openMediaTab(page);

  // Style lock is open (intro + entrance approved earlier in this suite),
  // so the batch button appears with the count of ready slots.
  const button = page.getByTestId("generate-remaining");
  await expect(button).toBeVisible();
  await expect(button).toContainText("2");
  await button.click();

  await expect(page.getByTestId("slot-homesite-state")).toHaveText(/generating|in review/i, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("slot-corner_2_approach-state")).toHaveText(
    /generating|in review/i,
    { timeout: 20_000 },
  );
  // Slots without their protocol photos were not queued.
  await expect(page.getByTestId("slot-corner_3_approach-state")).toHaveText(/missing/i);
});
