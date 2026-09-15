# Greenways — Gate 2 Phase Report

**Phase 2: Foundation & Admin Console · September 15, 2026 · Status: built; awaiting hosted-schema paste + Vercel connection for the click-through preview**

## What's built

**Repo and foundation.** The Phase 1 hand-off is the repo root (`CLAUDE.md`, docs, brand kit, design system, pilot data). On top of it: Next.js 15 App Router + strict TypeScript, pnpm, Tailwind riding `phase1/src/tailwind.preset.js` and `greenways.css` verbatim, shadcn-style primitives re-themed to the Greenways semantic tokens, next-intl with cookie locale and no path prefix (one link serves EN and ES), Zilla Slab 600/700 and Atkinson Hyperlegible Next (variable 400–800) self-hosted via `next/font` so type renders offline in the field. Two surfaces exist as `[data-surface="light"]` (admin) and `[data-surface="walk"]` (dark walk chrome — proven by the `/walk/[slug]` placeholder, whose every string comes from `messages/en.json`/`es.json`).

**Database (Supabase).** One migration creates the full v1 model — `properties` (i18n name jsonb, entrance, boundary GeoJSON, status, `es_reviewed` + reviewer + timestamp), `corners` (n, lat/lng, i18n name/stake, photo paths, `locked`), `media_assets`, `generation_jobs`, `walk_links`, `walk_sessions`, `walk_events`, `team_users`, `invites`, `demo_scenarios`, plus `audit_log`. RLS is enabled on every table: team members read/write content, deletes and team management are admin-only, and the `property-photos` Storage bucket is private with team-only policies. Guardrails live in the database, not just the UI:

- A trigger on `corners` refuses to move a locked corner, refuses a non-admin unlock, and writes every lock/unlock to `audit_log`.
- A trigger on `properties` blocks `status='published'` while Spanish is unreviewed or any corner is unlocked.
- A `before insert` trigger on `auth.users` makes magic links **invite-only**: an email absent from `invites`/`team_users` cannot create a user, whatever the client does. On first sign-in the invite is promoted to a `team_users` row with its role (admin | editor).

**Admin console (desktop, English).** Sign-in (invite pre-check with the "ask an admin to invite you" copy), properties list with status pills, and the property editor with eight tabs:

- *Overview* — assemble checklist computed from live data (KML, corner locks, photo protocol count, EN/ES content, review flag, publish state) with a "next step" pointer.
- *Corners* — Import KML (buyer-lot-map standard) → boundary polygon + corners auto-numbered **clockwise from the entrance**, C1 = the corner just before the entrance so C1→C2 crosses it (matches the Gate 1 Lot 4 numbering: C1=NW, C2=NE, C3=SE, C4=SW). MapLibre GL + Mapbox Satellite renders when `NEXT_PUBLIC_MAPBOX_TOKEN` exists; otherwise the drawn dark-surface fallback (SVG in local feet, Trailhead Green lot line over a casing, Harvest Gold numbered pins, entrance marker, N chip). Drag-to-adjust works only while unlocked; unlock is an admin action enforced and logged by the DB. Entrance can be moved (snapped to the lot line) and renumbering re-derives, carrying names/stakes/photos with their physical corner. Re-import is refused while locked.
- *Photos* — capture-protocol checklist (approach ~30 ft + stake close-up per corner; entrance 360°, homesite 360°, gate, aerial) uploading to the private `property-photos` bucket.
- *Content* — paired EN/ES fields for the display name and each corner's name + stake description; **Draft Spanish** calls the Anthropic API (usted register, feet stay "pies"; optional via `ANTHROPIC_API_KEY`; drafts only fill empty ES fields); the **"Spanish reviewed by a person"** flag records who and when, any save clears it, and publish is blocked while it's unset — in the UI and by the DB trigger.
- *Team* — roster + invites; invite form is admin-only (RLS-enforced too).
- *Media, Publish, Analytics, Demo* — stubs with the Phase 3–5 empty states; Publish shows the live "blocked: Spanish unreviewed" banner; Demo lists the four seeded scenarios (clean / noisy GPS / compass error / boundary wander).

**Geometry library (`lib/geo`).** Local-tangent-plane projection in feet (HUD spec §2 constants), bearing (degrees clockwise from north), point-in-polygon, signed distance to the boundary (positive inside, §7), clockwise normalization, corner ordering from the entrance, area in acres, and the KML parser. All pure functions.

**Pilot data.** `supabase/seed.sql` enters Broussard Lot 4 from the CAD-verified KML values: boundary, entrance at the midpoint of the Broussard Rd frontage (30.173831, −94.195878), four locked corners with EN/ES names and stake descriptions (Spanish marked unreviewed until a person confirms), 1.49 ac, and the four demo scenarios. The E2E separately proves the same property can be entered end-to-end through the UI from `data/lot4_gaines_acres.kml`. The Google aerial test capture stays in `/data` — internal only, never served.

**CI.** GitHub Actions on every push/PR: lint, typecheck, 27 Vitest unit tests, production build, and the Playwright E2E against a local Supabase stack (migrations + seed + real auth triggers). Sentry is wired but env-optional.

## What's tested

- **Unit (Vitest, 27):** projection round-trip and scale constants, bearing quadrants, angular delta short-path, point-in-polygon incl. boundary cases, signed distance sign/magnitude, ring normalization and clockwise detection, **Lot 4 numbering matches Gate 1 (C1=NW…)**, renumbering when the entrance moves, Lot 4 area ≈ 1.49 ac, KML parsing of the real pilot file plus malformed-input rejections.
- **E2E (Playwright, 6):** uninvited email turned away at sign-in; invited admin in via magic-link token; create property → import the real KML → four corners in the table with C1 at the NW road corner → lock → re-import refused; admin invites a second member from the Team tab; that editor signs in via the invite and edits content, and has no unlock affordance; Publish shows the block while Spanish is unreviewed.
- Migration + seed validated against Postgres 16 directly; production build compiles all 17 routes.

## What's placeholder

- `/walk/[slug]` is a bilingual shell — the arrow HUD, sensors, PWA/offline are Phase 3.
- Media/Publish/Analytics/Demo tabs are empty states; publish itself (links + QR) is Phase 5.
- The corners map in the preview uses the drawn fallback until a Mapbox token lands; the MapLibre satellite path is written but exercised only without imagery.
- `database.types.ts` was written by hand to the migration (Docker registries are blocked in this build environment); regenerate with `pnpm db:types` once a local stack or project link exists — shapes are identical either way.

## Decisions I made that you should check

1. **Corner numbering rule formalized:** C1 = the corner immediately *before* the entrance walking clockwise, so C1→C2 crosses the entrance. Reproduces Gate 1's Lot 4 numbering exactly; on KML import with no entrance hint, the entrance defaults to the first edge's midpoint and is meant to be moved (Lot 4's seed sets the true road-frontage midpoint).
2. **Added `audit_log`** beyond the v1 model — corner lock/unlock, KML import, entrance moves, review-flag changes and publishes get a durable trail. The Corners tab shows the latest lock event.
3. **Capture photos live in `media_assets`** as `type='capture'`, `status='approved'` (human-shot, no review queue); corner approach/stake shots sit on the corner row per the v1 model.
4. **Saving any content change clears the "reviewed by a person" flag.** Strict, but it guarantees no unreviewed Spanish rides a stale approval into publish.
5. **Roles:** editors can create/edit properties, import KML (while unlocked), lock corners, upload photos, edit content; only admins unlock corners, invite/remove team, delete anything.
6. **Arrival note** from the prototype's Content tab is deferred — it isn't in the v1 data model; say the word and it becomes a jsonb field alongside the stake text.

## Open risks carried forward

- **Hosted schema not yet applied** — the cloud project (`pdrvinfahqnskuwqumuu`) has keys wired into the app, but the SQL needs one paste in the dashboard (README §Hosted Supabase) or a DB password/access token for `supabase db push`. Until then the deployed app has no tables behind it.
- **No preview URL yet** — Vercel token still to arrive; connecting the repo gives every PR a preview URL from then on.
- The real email delivery path for magic links (SMTP, deliverability, 15-min expiry copy) is proven only through Supabase's local mail sink and the token flow; verify once the hosted project has the schema and you sign in for real.
- Supabase free tier pauses after 7 idle days during build — known, resolved at Gate 6.
- iOS compass behavior and everything sensor-side remains Phase 3 risk, unchanged from Gate 1.

## Inputs still needed

1. **Cloud schema**: paste the two SQL files (or send the DB password / a personal access token and I'll push and regenerate types).
2. **Vercel token** → repo connection → preview URL for the Gate 2 click-through.
3. **Team roster with roles** for real invites (seed has both of Alton's emails as admin).
4. **Mapbox token** (or the Google Maps Platform decision from the kickoff §4) for satellite on the Corners tab.
5. **Anthropic API key** on the deployment to light up Draft Spanish.
6. **Broussard photos to protocol** + stake status/descriptions to replace the seeded stake text.

## Gate 2 ask

Paste the schema (or send credentials), connect Vercel, then click through: sign in with your email → Properties → Broussard Lot 4 → Corners (map, table, lock/unlock as admin) → Photos upload → Content (draft + review flag) → Team (invite a second address and sign in with it). Approve or send changes; Phase 3 (Corner Finder PWA + demo mode) starts on approval.
