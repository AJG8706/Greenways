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

test("publish is blocked until Spanish review, then goes live", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/admin/properties/${propertyId}`);
  await page.getByTestId("tab-publish").click();

  await expect(page.getByTestId("publish-blocked")).toBeVisible();
  await page.getByTestId("publish-toggle").click();
  await expect(page.getByTestId("publish-error")).toContainText(/spanish/i);

  // A person reviews the Spanish (Content tab elsewhere); service role stands in.
  const supabase = adminApi();
  await supabase.from("properties").update({ es_reviewed: true }).eq("id", propertyId);

  await page.reload();
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
        { name: "corner_found", data: { n: 1, seconds: 30, accuracyFt: 12 }, ts: 2 },
        { name: "corner_found", data: { n: 2, seconds: 50, accuracyFt: 15 }, ts: 3 },
        { name: "walk_completed", data: { seconds: 200 }, ts: 4 },
      ],
    },
  });
  expect(first.status()).toBe(200);

  // A demo session: never counted as a buyer walk.
  await request.post("/api/walk-events", {
    data: {
      slug: SLUG,
      locale: "es",
      device: "demo:clean · e2e",
      events: [{ name: "walk_opened", ts: 1 }],
    },
  });

  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/admin/properties/${propertyId}`);
  await page.getByTestId("tab-analytics").click();

  await expect(page.getByTestId("stat-sessions")).toContainText("1");
  await expect(page.getByTestId("stat-completed")).toContainText("100%");
  await expect(page.getByTestId("corner-times")).toContainText("Corner 1");
  await expect(page.getByTestId("recent-walks")).toContainText("Demo");
});
