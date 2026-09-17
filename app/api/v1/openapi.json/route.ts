import { NextResponse } from "next/server";

/**
 * OpenAPI 3.1 description of /api/v1 — public (no secrets in a spec), so
 * any tool (n8n, Postman, Zapier, a GPT action) can import it directly.
 */
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://greenways-jade.vercel.app";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Greenways API",
    version: "1.0.0",
    description:
      "Programmatic access to Greenways properties, walk links and walk analytics. " +
      "Authenticate every request with an admin-issued bearer key (Team tab → API keys). " +
      "Full guide: docs/API.md in the repository.",
  },
  servers: [{ url: `${BASE}/api/v1` }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key issued from the admin Team tab (format gw_live_…).",
      },
    },
    schemas: {
      I18nText: {
        type: "object",
        properties: { en: { type: "string" }, es: { type: "string" } },
      },
      PropertySummary: {
        type: "object",
        properties: {
          slug: { type: "string" },
          name: { $ref: "#/components/schemas/I18nText" },
          address: { type: ["string", "null"] },
          county: { type: ["string", "null"] },
          acres: { type: ["number", "null"] },
          status: { type: "string", enum: ["draft", "published"] },
          sale_status: { type: "string", enum: ["available", "under_contract", "sold"] },
          spanish_reviewed: { type: "boolean" },
          demo_mode: { type: "boolean" },
          test_lot: { type: "boolean" },
          corners: {
            type: "object",
            properties: { total: { type: "integer" }, locked: { type: "integer" } },
          },
          walk_url: { type: ["string", "null"], description: "Public walk URL once published" },
          published_at: { type: ["string", "null"], format: "date-time" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      ProspectLinkRequest: {
        type: "object",
        properties: {
          ghl_contact_id: { type: "string", description: "GoHighLevel contact id (optional)" },
          locale: { type: "string", enum: ["en", "es"], default: "en" },
          expires_days: { type: "integer", minimum: 1, maximum: 365, default: 30 },
        },
      },
      ProspectLinkResponse: {
        type: "object",
        properties: {
          url: { type: "string" },
          token: { type: "string" },
          expires_at: { type: "string", format: "date-time" },
          published: { type: "boolean" },
          sms: {
            type: "object",
            properties: { en: { type: "string" }, es: { type: "string" } },
            description: "Ready-to-send walk-pack SMS in both languages",
          },
        },
      },
      WalkAnalytics: {
        type: "object",
        properties: {
          slug: { type: "string" },
          buyerWalks: { type: "integer" },
          completed: { type: "integer" },
          completionPct: { type: "integer" },
          medianCornerSeconds: { type: ["integer", "null"] },
          perCorner: {
            type: "array",
            items: {
              type: "object",
              properties: {
                n: { type: "integer" },
                count: { type: "integer" },
                medianSeconds: { type: ["integer", "null"] },
              },
            },
          },
          boundaryExits: { type: "integer" },
          compassProblems: { type: "integer" },
          languages: {
            type: "object",
            properties: { en: { type: "integer" }, es: { type: "integer" } },
          },
          prospectWalks: { type: "integer" },
          demoWalks: { type: "integer" },
        },
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" }, detail: { type: "string" } },
      },
    },
  },
  paths: {
    "/properties": {
      get: {
        summary: "List properties",
        operationId: "listProperties",
        responses: {
          "200": {
            description: "All properties with walk state",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    properties: {
                      type: "array",
                      items: { $ref: "#/components/schemas/PropertySummary" },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing/invalid key",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/properties/{slug}": {
      get: {
        summary: "Property detail (corners, media slots, prospect links)",
        operationId: "getProperty",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Full property detail" },
          "404": {
            description: "Unknown slug",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/properties/{slug}/links": {
      post: {
        summary: "Issue a tokenized prospect walk link",
        operationId: "issueProspectLink",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ProspectLinkRequest" } },
          },
        },
        responses: {
          "201": {
            description: "Link issued",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProspectLinkResponse" } },
            },
          },
          "404": { description: "Unknown slug" },
        },
      },
    },
    "/properties/{slug}/analytics": {
      get: {
        summary: "Walk analytics (same numbers as the admin tab)",
        operationId: "getWalkAnalytics",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Aggregated walk analytics",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/WalkAnalytics" } },
            },
          },
          "404": { description: "Unknown slug" },
        },
      },
    },
  },
} as const;

export function GET() {
  return NextResponse.json(spec);
}
