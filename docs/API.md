# Greenways API v1

Programmatic access to Greenways for external tools — n8n, GoHighLevel,
spreadsheets, dashboards, future apps. Read properties, issue prospect walk
links, and pull walk analytics without touching the admin console.

- **Base URL**: `https://greenways-jade.vercel.app/api/v1`
- **Machine-readable spec**: [`/api/v1/openapi.json`](https://greenways-jade.vercel.app/api/v1/openapi.json)
  (OpenAPI 3.1 — import it into n8n, Postman, Zapier or a GPT action and the
  endpoints self-describe)
- **Format**: JSON in, JSON out. UTF-8. Times are ISO 8601 UTC.
- **Versioning**: breaking changes get a new path (`/api/v2`); `/api/v1`
  responses only ever gain fields.

## Authentication

Every request needs an **API key** in the `Authorization` header:

```
Authorization: Bearer gw_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Keys are created by an **admin** in the console: **Team tab → API keys →
Create key**. Name the key after the tool that will hold it (one key per
tool, so revoking one integration never breaks another).

- The secret is shown **once** at creation. Only its SHA-256 is stored.
- Revoke any key instantly from the same table; requests with it fail with
  `401` from that moment.
- `last_used_at` on the table shows whether a key is actually in use.

Failure modes:

| Status | Meaning |
|---|---|
| `401 {"error":"unauthorized"}` | Missing header, malformed key, unknown key, or revoked key (`detail` says which) |
| `404 {"error":"unknown property"}` | The `slug` doesn't exist |
| `500 {"error": "…"}` | Server-side failure — safe to retry with backoff |

## Endpoints

### `GET /properties` — list all properties

```bash
curl -s https://greenways-jade.vercel.app/api/v1/properties \
  -H "Authorization: Bearer $GREENWAYS_API_KEY"
```

```json
{
  "properties": [
    {
      "slug": "broussard-lot-4",
      "name": { "en": "Broussard Lot 4", "es": "Lote 4 de Broussard" },
      "address": "8990 Broussard Rd, Beaumont, TX 77713",
      "county": "Jefferson",
      "acres": 1.49,
      "status": "published",
      "sale_status": "available",
      "spanish_reviewed": true,
      "demo_mode": true,
      "test_lot": false,
      "corners": { "total": 4, "locked": 4 },
      "walk_url": "https://greenways-jade.vercel.app/walk/broussard-lot-4",
      "published_at": "2026-09-18T01:00:00Z",
      "created_at": "2026-09-15T20:00:00Z"
    }
  ]
}
```

`walk_url` is `null` until the property is published — the walk itself 404s
for unpublished listings, so never hand out a null link.

### `GET /properties/{slug}` — full detail

Everything the list gives, plus: entrance coordinates, every corner
(`n, lat, lng, name, stake, locked`), media-slot approval state
(`intro / entrance / corner_N_approach / homesite`), prospect-link history,
`geometry_source`, and the pinned `monday_item_id`.

Corner coordinates are the CAD-verified geometry — treat them as read-only
truth; they can only change through the admin console's locked-corner flow.

### `POST /properties/{slug}/links` — issue a prospect walk link

The programmatic version of the Publish tab's "Issue link". Creates a
tokenized link tied to a prospect so their walk sessions are attributed.

```bash
curl -s -X POST \
  https://greenways-jade.vercel.app/api/v1/properties/broussard-lot-4/links \
  -H "Authorization: Bearer $GREENWAYS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ghl_contact_id": "abc123", "locale": "es", "expires_days": 30}'
```

Response `201`:

```json
{
  "url": "https://greenways-jade.vercel.app/walk/broussard-lot-4?t=…",
  "token": "…",
  "expires_at": "2026-10-18T01:00:00Z",
  "published": true,
  "sms": {
    "en": "Your Greenways walk for Broussard Lot 4 is ready: … — Texas Greener Pastures",
    "es": "Su recorrido Greenways de Lote 4 de Broussard está listo: … — Texas Greener Pastures"
  }
}
```

All fields optional; defaults `locale: "en"`, `expires_days: 30` (1–365).
`sms` is the ready-to-send walk-pack message in both languages — send the
one matching the contact. If `published` is `false`, the link is created
but won't serve until the property is published.

> The GHL booking flow has its own door for this: `POST /api/links/issue`
> (outside `/v1`) authenticated with the `x-webhook-secret` header
> (`N8N_WEBHOOK_SECRET`) instead of an API key. Same request/response shape,
> plus a required `slug` in the body. Both doors share one implementation.

### `GET /properties/{slug}/analytics` — walk analytics

The exact numbers the admin Analytics tab shows (one shared aggregator):

```json
{
  "slug": "broussard-lot-4",
  "buyerWalks": 12,
  "completed": 9,
  "completionPct": 75,
  "medianCornerSeconds": 47,
  "perCorner": [{ "n": 1, "count": 11, "medianSeconds": 38 }],
  "boundaryExits": 2,
  "compassProblems": 1,
  "languages": { "en": 8, "es": 4 },
  "prospectWalks": 5,
  "demoWalks": 20
}
```

Demo sessions (team QA) never count toward buyer numbers; `demoWalks` shows
them separately. Aggregation covers the most recent 500 sessions.

## Recipes

**n8n — booking → SMS**: HTTP Request node → `POST /api/links/issue` with the
`x-webhook-secret` header → take `sms.es` or `sms.en` from the response into
the GHL SMS action. (Or use `/v1/properties/{slug}/links` with an API key.)

**Spreadsheet inventory pull**: `GET /properties` on a schedule → columns
from `slug`, `sale_status`, `corners.locked`, `walk_url`.

**Weekly walk report**: for each published property,
`GET /properties/{slug}/analytics` → post `buyerWalks`, `completionPct`,
`medianCornerSeconds` wherever the team reads reports.

## Practices

- One key per tool; revoke on any suspicion — reissuing takes seconds.
- Keys are server-side credentials: never embed one in a browser page,
  a shared doc, or a client app.
- No hard rate limit is enforced today; keep polling ≥ 1 minute apart.
  Abusive patterns will get keys revoked before they get limits built.
- Buyer-facing rules still hold end to end: the API never exposes
  unapproved media, and walk URLs only work for published properties.
