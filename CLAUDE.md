# Greenways — CLAUDE.md (repo hand-off from Phase 1)

Greenways is Texas Greener Pastures' property walkthrough web app: a desktop **admin console** where the team assembles a per-property walk (CAD-verified corners, photos to protocol, Higgsfield-generated media, publish + links + QR, analytics) and a mobile **buyer walk** — a phone-browser PWA that points one big labeled arrow with live distance at each corner stake, dings on arrival, and plays the immersive clips. No buyer account, no install. Bilingual English/Spanish.

This file is the standing brief for Claude Code. Read it before touching the repo. The full plan with gates is `docs/TGP-Walkthrough-Project-Plan-v1.md`; the HUD behavior is `docs/greenways-hud-interaction-spec.md`; the Gate 1 prototype (`phase1/dist/greenways-prototype.html`) is the visual and interaction reference.

## Locked decisions (do not relitigate without Alton)
- Full platform: Next.js 15 App Router + TypeScript, Supabase (Postgres, Auth magic links invite-only, Storage, RLS), Vercel. Build on free tiers; move to Vercel Pro / Supabase Pro at launch (Gate 6 decision; R2 for media is the alternative).
- Higgsfield media is generated **via API** with a human review queue; nothing reaches a buyer unapproved.
- Links: one public link + QR per property **and** tokenized per-prospect links issued from the GHL Property Tours booking (calendar `xBSMR6gHnlxKqJfB5Pte`) through n8n.
- Admin = desktop, English only. Buyer = mobile-first (Android + iPhone, mostly Chrome), **EN + ES from day one** (next-intl, cookie locale, no path prefix — one link serves both).
- Buyer app has a satellite mini-map (MapLibre GL + Mapbox Satellite; token in TGP's account) but the arrow HUD is primary.
- Demo/QA mode: launched from the admin Demo tab, simulates a walker on the real corners through the **same code path** as the field walk. No public landing page.
- Gate per phase with a deployed preview URL and a short phase report; Alton approves before the next phase starts.

## Standing guardrails (product rules, enforced in code and review)
1. One tracked corner at a time, always labeled; the picker shows the rest.
2. Corners come only from CAD-verified parcel geometry (the buyer-lot-map KML standard). Never hand-guessed. Locked after verification; unlocking is an admin action that is logged.
3. Generated media must depict the actual land. Review queue is mandatory; rejected clips regenerate from the same source frames.
4. GPS honesty in the UI: "Stakes mark the exact corner. The arrow gets you within a few steps."
5. Buyers never need an account or an install. Link → walking in under 30 seconds.
6. Every buyer-facing string exists in `messages/en.json` and `messages/es.json`. Hard-coded English in a buyer component is a bug. Per-property free text has paired EN/ES fields with a draft-translation helper and a "reviewed by a person" flag; unreviewed Spanish blocks publish.
7. Brand: `greenways-tokens.css` is the color source of truth; only approved pairings (see `docs/greenways-brand-spec.html`). Harvest Gold and Trailhead Green are never text on cream. Fence Post Red is errors and sold lots only. Logos from the SVG masters; never retyped.

## Stack conventions
- `pnpm`. Node 20+. Strict TypeScript; no `any` in app code.
- UI: Tailwind with `tailwind.preset.js` + `greenways.css` semantic variables; shadcn/ui primitives re-themed, not restyled ad hoc. Two surfaces: `[data-surface="light"]` (admin) and `[data-surface="walk"]` (buyer). Fonts self-hosted via `next/font` (Zilla Slab 600/700, Atkinson Hyperlegible Next 400/500/700).
- Data: Supabase migrations in `supabase/migrations`, typed client from `supabase gen types`. RLS on every table. Service role only in server actions/route handlers.
- Geometry: local tangent plane in feet (see HUD spec §2); all distances in feet internally; format at the edge.
- PWA: Serwist service worker; per-property precache manifest (config, corner photos, clips, fonts). Offline after first load is a release criterion.
- Testing: Vitest for geodesy/filters/arrival logic (pure functions in `lib/geo`, `lib/hud`); Playwright for admin flows and the simulated-walk E2E; Lighthouse PWA + performance budget in CI (mid-range Android profile). CI must be green to merge.
- Observability: Sentry (free tier), Vercel Analytics, `walk_events` table (event names in HUD spec §11).
- Secrets: `.env.local` only; never commit. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `HIGGSFIELD_API_KEY`, `N8N_WEBHOOK_SECRET`, `MONDAY_API_TOKEN`.

## Data model (v1)
`properties` (slug, name i18n jsonb, address, county, acres, entrance point, boundary geojson, status, published_at) · `corners` (property_id, n, lat, lng, name i18n, stake i18n, approach_photo, stake_photo, locked) · `media_assets` (property_id, type, slot, storage_path, status generated|approved|rejected, source_photo, higgsfield_job_id, reject_reason) · `generation_jobs` · `walk_links` (property_id, kind public|prospect, token, ghl_contact_id, locale, expires_at, revoked_at) · `walk_sessions` (link_id, locale, started_at, ended_at, device) · `walk_events` · `team_users` + `invites` (role admin|editor) · `demo_scenarios`.

## Phases (each ends in a preview URL + report; see the plan for acceptance criteria)
2 Foundation & admin console → 3 Corner Finder PWA + demo mode → 4 Higgsfield pipeline → 5 Integration, links, analytics → 6 Creation automation & hardening → 7 Pilot & launch.

## Working style Alton expects
Terse, execution-first. Flag unverifiable data honestly instead of papering over it. Version anything that changes (v1, v2) and state confidence. Show the work when correcting a mistake. Don't ask him to fetch things you can fetch.

## Phase 1 artifacts in this package
- `phase1/dist/greenways-prototype.html` — the Gate 1 prototype (also published as a claude.ai artifact).
- `phase1/src/greenways.css`, `phase1/src/tailwind.preset.js` — design system.
- `phase1/src/messages/en.json`, `es.json` — message catalogs (drop into `messages/`).
- `docs/greenways-hud-interaction-spec.md`, `docs/greenways-copy-deck-en-es.md`, `docs/TGP-Walkthrough-Project-Plan-v1.md`.
- `brand/` — Greenways brand kit v1.0 (SVG masters, PNG exports, tokens, spec).
- `data/lot4_gaines_acres.kml` — pilot property geometry.
