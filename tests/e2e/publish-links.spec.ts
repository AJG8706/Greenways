import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, adminApi, signIn } from "./helpers";

/**
 * Phase 5: publish gate + links. A listing (no demo mode, no test lot)
 * serves buyers only once published; the Publish tab drives the flow and
 * issues tokenized prospect links; the n8n endpoint issues them with the
 * shared secret.
 */

test.describe.configure({ mode: "serial" });

const SLUG = "e2e-publish-lot";
// Small square in Jefferson County with the entrance on the north edge.
const RING = [
  { n: 1, lat: 30.1745, lng: -94.1965 },
  { n: 2, lat: 30.1745, lng: -94.1955 },
  { n: 3, lat: 30.1738, lng: -94.1955 },
  { n: 4, lat: 30.1738, lng: -94.1965 },
];

let propertyId: string;

test.beforeAll(async () => {
  const supabase = adminApi();
  await supabase.from("properties").delete().eq("slug", SLUG);

  const { data: property, error } = await supabase
    .from("properties")
    .insert({
      slug: SLUG,
      name: { en: "E2E Publish Lot", es: "Lote de prueba" },
      county: "Jefferson",
      entrance_lat: 30.1745,
      entrance_lng: -94.196,
      es_reviewed: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  propertyId = property.id;

  const { error: cornersError } = await supabase.from("corners").insert(
    RING.map((c) => ({
      property_id: propertyId,
      n: c.n,
      lat: c.lat,
      lng: c.lng,
      locked: true,
    })),
  );
  if (cornersError) throw new Error(cornersError.message);
});

test("an unpublished listing never serves a walk (locked corners or not)", async ({ page }) => {
  const res = await page.request.get(`/walk/${SLUG}`);
  expect(res.status()).toBe(404);
});

test("publish goes live without Spanish review (note shown, gate relaxed)", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/admin/properties/${propertyId}`);
  await page.getByTestId("tab-publish").click();

  // Unreviewed Spanish is surfaced as a note but no longer blocks the gate
  // (relaxed Nov 2026); locked corners remain the hard requirement.
  await expect(page.getByTestId("es-unreviewed-note")).toBeVisible();
  await page.getByTestId("publish-toggle").click();
  await expect(page.getByTestId("publish-status")).toHaveText(/published/i, {
    timeout: 15_000,
  });

  const res = await page.request.get(`/walk/${SLUG}`);
  expect(res.status()).toBe(200);
});

test("prospect links: issue from the tab, walk serves with token, revoke", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/admin/properties/${propertyId}`);
  await page.getByTestId("tab-publish").click();

  await page.getByTestId("issue-locale").selectOption("es");
  await page.getByTestId("issue-contact").fill("ghl-e2e-1");
  await page.getByTestId("issue-link").click();
  await expect(page.getByTestId("prospect-links")).toContainText("ghl-e2e-1", {
    timeout: 15_000,
  });

  const supabase = adminApi();
  const { data: link } = await supabase
    .from("walk_links")
    .select("id, token")
    .eq("property_id", propertyId)
    .eq("kind", "prospect")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const res = await page.request.get(`/walk/${SLUG}?t=${link!.token}`);
  expect(res.status()).toBe(200);

  await page.getByTestId(`revoke-${link!.id}`).click();
  await expect(page.getByTestId("prospect-links")).toContainText(/revoked/i, {
    timeout: 15_000,
  });
});

test("n8n issue endpoint: shared secret gates it; response carries URL + SMS", async ({
  request,
}) => {
  const noAuth = await request.post("/api/links/issue", {
    data: { slug: SLUG },
  });
  expect(noAuth.status()).toBe(401);

  const res = await request.post("/api/links/issue", {
    headers: { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET ?? "e2e-webhook-secret" },
    data: { slug: SLUG, ghl_contact_id: "ghl-e2e-2", locale: "es", expires_days: 5 },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    url: string;
    published: boolean;
    sms: { en: string; es: string };
  };
  expect(body.url).toContain(`/walk/${SLUG}?t=`);
  expect(body.published).toBe(true);
  expect(body.sms.es).toContain(body.url);
  expect(body.sms.es).toContain("Lote de prueba");
  expect(body.sms.en).toContain("E2E Publish Lot");
});

test("analytics tab aggregates buyer walks and separates demo", async ({ page, request }) => {
  // A public buyer session: opens, finds two corners, completes.
  const first = await request.post("/api/walk-events", {
    data: {
      slug: SLUG,
      locale: "en",
      device: "e2e-phone",
      events: [
        { name: "walk_opened", ts: 1 },
        { name: "pos_sample", data: { lat: 30.1744, lng: -94.1964 }, ts: 2 },
        { name: "pos_sample", data: { lat: 30.1744, lng: -94.1964 }, ts: 2 },
        { name: "pos_sample", data: { lat: 30.174, lng: -94.1957 }, ts: 3 },
        { name: "corner_found", data: { n: 1, seconds: 30, accuracyFt: 12 }, ts: 2 },
        { name: "corner_found", data: { n: 2, seconds: 50, accuracyFt: 15 }, ts: 3 },
        { name: "walk_completed", data: { seconds: 200 }, ts: 4 },
      ],
    },
  });
  expect(first.status()).toBe(200);

  // A demo session: never counted as a buyer walk. Demo sessions only exist
  // on demo-enabled properties — the ingest strips a spoofed "demo:" prefix
  // anywhere else — so demo mode is on while this session starts.
  const supabase = adminApi();
  await supabase.from("properties").update({ demo_mode: true }).eq("id", propertyId);
  const demoRes = await request.post("/api/walk-events", {
    data: {
      slug: SLUG,
      locale: "es",
      device: "demo:clean · e2e",
      events: [{ name: "walk_opened", ts: 1 }],
    },
  });
  expect(demoRes.status()).toBe(200);
  await supabase.from("properties").update({ demo_mode: false }).eq("id", propertyId);

  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/admin/properties/${propertyId}`);
  await page.getByTestId("tab-analytics").click();

  await expect(page.getByTestId("stat-sessions")).toContainText("1");
  await expect(page.getByTestId("stat-completed")).toContainText("100%");
  await expect(page.getByTestId("corner-times")).toContainText("Corner 1");
  await expect(page.getByTestId("recent-walks")).toContainText("Demo");

  // The heatmap draws from the pos_sample events: lot outline + density.
  await expect(page.getByTestId("walk-heatmap")).toBeVisible();
});

test("automations: off by default; digest composes; no-show nudges once", async ({
  request,
}) => {
  const SECRET = process.env.N8N_WEBHOOK_SECRET ?? "e2e-webhook-secret";
  const supabase = adminApi();

  // Both automations ship OFF: with no settings rows the endpoints no-op.
  await supabase.from("app_settings").delete().in("key", ["weekly_digest", "noshow_nudges"]);
  const offRes = await request.post("/api/digest", {
    headers: { "x-webhook-secret": SECRET },
    data: {},
  });
  expect(offRes.status()).toBe(200);
  expect(((await offRes.json()) as { enabled: boolean }).enabled).toBe(false);

  // Digest on: earlier tests walked this property, so the text has content.
  await supabase.from("app_settings").upsert({ key: "weekly_digest", value: { enabled: true } });
  const digestRes = await request.post("/api/digest", {
    headers: { "x-webhook-secret": SECRET },
    data: {},
  });
  expect(digestRes.status()).toBe(200);
  const digest = (await digestRes.json()) as { enabled: boolean; text: string | null };
  expect(digest.enabled).toBe(true);
  expect(digest.text).toContain("Greenways");

  // No-show on: a prospect link issued 4 days ago that nobody ever opened
  // gets exactly one nudge, stamped on the link.
  await supabase
    .from("app_settings")
    .upsert({ key: "noshow_nudges", value: { enabled: true, days: 3 } });
  const { data: staleLink } = await supabase
    .from("walk_links")
    .insert({
      property_id: propertyId,
      kind: "prospect",
      token: `e2e-noshow-${Date.now()}`,
      contact_phone: "+14095550188",
      created_at: new Date(Date.now() - 4 * 86400_000).toISOString(),
    })
    .select("id")
    .single();
  const nudgeRes = await request.post("/api/links/no-shows", {
    headers: { "x-webhook-secret": SECRET },
    data: {},
  });
  expect(nudgeRes.status()).toBe(200);
  const nudge = (await nudgeRes.json()) as { enabled: boolean; nudged: number };
  expect(nudge.enabled).toBe(true);
  expect(nudge.nudged).toBeGreaterThanOrEqual(1);
  const { data: stamped } = await supabase
    .from("walk_links")
    .select("noshow_notified_at")
    .eq("id", staleLink!.id)
    .single();
  expect(stamped!.noshow_notified_at).not.toBeNull();

  // Second pass: the stamp holds, that link is never nudged again.
  const again = await request.post("/api/links/no-shows", {
    headers: { "x-webhook-secret": SECRET },
    data: {},
  });
  const { data: still } = await supabase
    .from("walk_links")
    .select("noshow_notified_at")
    .eq("id", staleLink!.id)
    .single();
  expect(still!.noshow_notified_at).toBe(stamped!.noshow_notified_at);
  expect(again.status()).toBe(200);

  // Leave both OFF, as shipped.
  await supabase.from("app_settings").delete().in("key", ["weekly_digest", "noshow_nudges"]);
});

test("webhook brute-force burns a per-IP budget and hits 429", async ({ request }) => {
  // Wrong-secret attempts are limited to 20/min per IP; a flood must start
  // seeing 429 instead of an unbounded stream of 401 oracle responses.
  let sawTooMany = false;
  for (let i = 0; i < 25 && !sawTooMany; i++) {
    const res = await request.post("/api/links/issue", {
      headers: { "x-webhook-secret": "wrong-secret-attempt" },
      data: { slug: SLUG },
    });
    if (res.status() === 429) sawTooMany = true;
    else expect(res.status()).toBe(401);
  }
  expect(sawTooMany).toBe(true);
});
