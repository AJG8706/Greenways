import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, adminApi, signIn } from "./helpers";

/**
 * Public API v1: bearer-key auth (sha256 stored, secret shown once), the
 * four endpoints against a published seed property, and the Team-tab key
 * management UI. Spec: docs/API.md and /api/v1/openapi.json.
 */

test.describe.configure({ mode: "serial" });

const SLUG = "e2e-api-lot";
const RING = [
  { n: 1, lat: 30.21, lng: -94.21 },
  { n: 2, lat: 30.21, lng: -94.2095 },
  { n: 3, lat: 30.2095, lng: -94.2095 },
  { n: 4, lat: 30.2095, lng: -94.21 },
];

// A known secret seeded directly by its hash — exactly how a stolen DB row
// would look: the secret itself never lands anywhere server-side.
const API_SECRET = `gw_live_${randomBytes(32).toString("base64url")}`;
const API_HASH = createHash("sha256").update(API_SECRET).digest("hex");
const AUTH = { Authorization: `Bearer ${API_SECRET}` };

let propertyId: string;

test.beforeAll(async () => {
  const supabase = adminApi();
  await supabase.from("properties").delete().eq("slug", SLUG);
  await supabase.from("api_keys").delete().eq("key_hash", API_HASH);

  const { data: property, error } = await supabase
    .from("properties")
    .insert({
      slug: SLUG,
      name: { en: "E2E API Lot", es: "Lote API" },
      county: "Jefferson",
      entrance_lat: 30.21,
      entrance_lng: -94.20975,
      es_reviewed: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  propertyId = property.id;

  const { error: cornersError } = await supabase.from("corners").insert(
    RING.map((c) => ({ property_id: propertyId, n: c.n, lat: c.lat, lng: c.lng, locked: true })),
  );
  if (cornersError) throw new Error(cornersError.message);

  const { error: publishError } = await supabase
    .from("properties")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", propertyId);
  if (publishError) throw new Error(publishError.message);

  const { error: keyError } = await supabase
    .from("api_keys")
    .insert({ name: "e2e", key_hash: API_HASH, prefix: API_SECRET.slice(0, 12) });
  if (keyError) throw new Error(keyError.message);
});

test("openapi spec is public; every data endpoint requires a key", async ({ request }) => {
  const spec = await request.get("/api/v1/openapi.json");
  expect(spec.status()).toBe(200);
  expect(((await spec.json()) as { openapi: string }).openapi).toBe("3.1.0");

  const bare = await request.get("/api/v1/properties");
  expect(bare.status()).toBe(401);

  const wrong = await request.get("/api/v1/properties", {
    headers: { Authorization: "Bearer gw_live_not-a-real-key" },
  });
  expect(wrong.status()).toBe(401);
  expect(((await wrong.json()) as { detail: string }).detail).toBe("Unknown key");
});

test("GET /properties lists the published lot with corner stats and walk_url", async ({
  request,
}) => {
  const res = await request.get("/api/v1/properties", { headers: AUTH });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    properties: Array<{
      slug: string;
      status: string;
      corners: { total: number; locked: number };
      walk_url: string | null;
    }>;
  };
  const lot = body.properties.find((p) => p.slug === SLUG);
  expect(lot).toBeDefined();
  expect(lot!.status).toBe("published");
  expect(lot!.corners).toEqual({ total: 4, locked: 4 });
  expect(lot!.walk_url).toContain(`/walk/${SLUG}`);
});

test("GET /properties/{slug} returns corners, media slots and entrance", async ({ request }) => {
  const missing = await request.get("/api/v1/properties/no-such-lot", { headers: AUTH });
  expect(missing.status()).toBe(404);

  const res = await request.get(`/api/v1/properties/${SLUG}`, { headers: AUTH });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    corners: Array<{ n: number; locked: boolean }>;
    media_slots: Array<{ slot: string; approved: boolean }>;
    entrance: { lat: number; lng: number } | null;
  };
  expect(body.corners).toHaveLength(4);
  expect(body.corners.every((c) => c.locked)).toBe(true);
  expect(body.media_slots.map((s) => s.slot)).toContain("corner_1_approach");
  expect(body.media_slots.every((s) => !s.approved)).toBe(true);
  expect(body.entrance).not.toBeNull();
});

test("POST /properties/{slug}/links issues an attributed prospect link", async ({ request }) => {
  const res = await request.post(`/api/v1/properties/${SLUG}/links`, {
    headers: AUTH,
    data: { ghl_contact_id: "ghl-api-e2e", locale: "es", expires_days: 7 },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as {
    url: string;
    published: boolean;
    sms: { en: string; es: string };
  };
  expect(body.url).toContain(`/walk/${SLUG}?t=`);
  expect(body.published).toBe(true);
  expect(body.sms.es).toContain(body.url);

  const walk = await request.get(body.url);
  expect(walk.status()).toBe(200);
});

test("GET /properties/{slug}/analytics matches the admin numbers", async ({ request }) => {
  const posted = await request.post("/api/walk-events", {
    data: {
      slug: SLUG,
      locale: "en",
      device: "e2e-api-phone",
      events: [
        { name: "walk_opened", ts: 1 },
        { name: "corner_found", data: { n: 1, seconds: 25, accuracyFt: 10 }, ts: 2 },
        { name: "walk_completed", data: { seconds: 120 }, ts: 3 },
      ],
    },
  });
  expect(posted.status()).toBe(200);

  const res = await request.get(`/api/v1/properties/${SLUG}/analytics`, { headers: AUTH });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    slug: string;
    buyerWalks: number;
    completed: number;
    completionPct: number;
    perCorner: Array<{ n: number; count: number }>;
    prospectWalks: number;
  };
  expect(body.slug).toBe(SLUG);
  expect(body.buyerWalks).toBe(1);
  expect(body.completed).toBe(1);
  expect(body.completionPct).toBe(100);
  expect(body.perCorner[0]).toMatchObject({ n: 1, count: 1 });
});

test("Team tab: create a key (secret shown once), then revoke kills it", async ({
  page,
  request,
}) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/admin/team");
  await expect(page.getByTestId("api-keys-card")).toBeVisible();

  await page.getByTestId("api-key-name").fill("e2e ui key");
  await page.getByTestId("api-key-create").click();
  const banner = page.getByTestId("api-key-secret");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  const secret = (await banner.locator("code").textContent())?.trim() ?? "";
  expect(secret.startsWith("gw_live_")).toBe(true);

  // The freshly created key works…
  const ok = await request.get("/api/v1/properties", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(ok.status()).toBe(200);

  // …the table shows only its prefix, and revoking it cuts access.
  await expect(page.getByTestId("api-keys-table")).toContainText("e2e ui key");
  const supabase = adminApi();
  const { data: row } = await supabase
    .from("api_keys")
    .select("id")
    .eq("name", "e2e ui key")
    .is("revoked_at", null)
    .single();

  await page.getByTestId(`api-key-revoke-${row!.id}`).click(); // arm
  await page.getByTestId(`api-key-revoke-${row!.id}`).click(); // confirm
  await expect(page.getByTestId("api-keys-table")).toContainText("Revoked", { timeout: 15_000 });

  const dead = await request.get("/api/v1/properties", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  expect(dead.status()).toBe(401);
  expect(((await dead.json()) as { detail: string }).detail).toBe("Key revoked");
});
