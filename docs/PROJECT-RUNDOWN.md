# Greenways — Project Rundown (agent hand-off)

**v1 · September 16, 2026.** This is the working brief for any model/agent picking up the Greenways build. Read `CLAUDE.md` first (standing guardrails and conventions — they are not negotiable), then this file for current state, then the gate reports. Owner: Alton Glenn (Texas Greener Pastures LLC). Working style he expects: terse, execution-first, flag unverifiable data honestly, version what changes, don't ask him to fetch what you can fetch.

## What this is

One web app, three surfaces, one database: a desktop **admin console** (English) where the TGP team assembles a per-property self-guided walkthrough, a mobile **buyer walk** PWA (bilingual EN/ES, no account, no install) that points a big arrow with live distance at each corner stake, and a **demo/QA mode** that runs the identical buyer-walk code path with a simulated walker. Plan with phase gates: `docs/TGP-Walkthrough-Project-Plan-v1.md`. Arrow-HUD behavior spec: `docs/greenways-hud-interaction-spec.md`. Visual reference: `phase1/dist/greenways-prototype.html` (open in a browser).

## Where things stand

| Gate | Status |
|---|---|
| Gate 0–1 (plan, design system, prototype) | Approved Sep 15 |
| Gate 2 (Foundation & admin console) | **Approved Sep 16** — `docs/Gate-2-Phase-Report.md` |
| Gate 3 (Corner Finder PWA + demo mode) | **Built, CI green, deployed. Waiting on the on-site Broussard field test** (HUD spec §12) — `docs/Gate-3-Phase-Report.md` |
| Gate 4 (Higgsfield media pipeline) | Not started — next build phase |
| Gate 5 (links/QR, GHL+n8n, analytics UI, Monday.com) | Not started |
| Gate 6 (assemble automation, hardening, Lighthouse) | Not started |
| Gate 7 (pilot & launch) | Not started |

**Production:** https://greenways-jade.vercel.app (Vercel project on `main`; every PR gets a preview URL).
Admin: `/admin` (magic-link sign-in, invite-only). Buyer walk: `/walk/broussard-lot-4`; demo: append `?demo=clean|noisy|compass|boundary`. Spanish: `NEXT_LOCALE=es` cookie or the ES chip.

## Stack and repo map

Next.js 15 App Router · TypeScript strict (no `any`) · pnpm · Tailwind 3 riding `phase1/src/tailwind.preset.js` + `phase1/src/greenways.css` (imported verbatim — the design system source of truth; body gets class `gw`, surfaces via `[data-surface="light"|"walk"]`) · next-intl (cookie locale `NEXT_LOCALE`, no path prefix; `messages/en.json` + `es.json`; admin keys exist in `en` only and es falls back per-key) · Supabase (Postgres/Auth/Storage/RLS) · Serwist PWA · Vitest + Playwright · GitHub Actions.

```
app/
  admin/(console)/...        # sign-in outside the group; properties list; editor tabs
  admin/(console)/properties/[id]/{corners,photos,content,media,publish,analytics,demo}
  walk/[slug]/               # buyer walk (server loads via service role)
  api/walk-events/           # telemetry ingest (service role)
  auth/confirm/              # magic-link landing (token_hash AND PKCE code)
  sw.ts, manifest.ts, fonts/ # Serwist worker, PWA manifest, self-hosted woff2
components/
  admin/ (corners-editor, drawn-map, satellite-map[Mapbox], google-map, ...)
  walk/  (walk-app controller, hud-parts, sheets, mini-map, google-mini-map, demo-tray)
  ui/    (shadcn-style primitives re-themed to Greenways tokens)
lib/
  geo/   # local-feet projection, bearing, polygon math, corner ordering (pure, tested)
  hud/   # position/heading filters, arrival, boundary, simulated walker (pure, tested)
  walk/  # sensor + demo sources, audio, events logger, types
  supabase/ (client/server/admin clients; database.types.ts — see gotcha below)
  kml.ts, i18n/, photos.ts, utils.ts
supabase/migrations/         # 2 migrations; seed.sql enters Broussard Lot 4
tests/unit (Vitest, 44) · tests/e2e (Playwright, 17)
.github/workflows/           # ci, db-push, verify-deploy, diagnose-auth, diagnose-walk
docs/                        # plan, HUD spec, copy deck, gate reports, this file
data/                        # lot4_gaines_acres.kml (pilot); lot4 aerial jpg = INTERNAL ONLY
brand/                       # brand kit; tokens are the color source of truth
```

## Delivery model

Work on a feature branch (history so far is on `claude/greenways-phase-2-mc1lfb`), conventional commits, **small PRs into `main`**; merging deploys production. CI must be green to merge: lint, typecheck, Vitest, `next build`, and the Playwright suite against a real local Supabase stack (`supabase start` works in GitHub runners). Local commands: `pnpm dev|build|lint|typecheck|test|test:e2e`, `pnpm db:start|db:reset|db:types` (needs Docker).

## Data model + enforcement (migrations 20260915000001, 20260916120000)

Tables: `properties` (i18n name jsonb, address, county, acres, entrance lat/lng, boundary GeoJSON, `status` draft|generating|review|published|error, `sale_status` available|under_contract|sold, `es_reviewed(+by,+at)`), `corners` (n, lat/lng, i18n name/stake, approach/stake photo paths, `locked`), `media_assets` (type capture|image|video, slot, status generated|approved|rejected), `generation_jobs`, `walk_links` (public|prospect, token), `walk_sessions`, `walk_events`, `team_users` + `invites` (admin|editor, `first_signed_in_at` / `last_sent_at`), `demo_scenarios`, `audit_log`. RLS on every table (team read/write; deletes + team management admin-only; storage bucket `property-photos` private, team-only).

**Guardrails live in Postgres triggers, not just UI:** locked corners cannot move; unlock is admin-only and audit-logged; `status='published'` is blocked while Spanish is unreviewed or any corner unlocked; a `before insert` trigger on `auth.users` makes magic links invite-only; invite "acceptance" = first real sign-in (`last_sign_in_at` transition), because issuing an OTP creates the auth user before any email is opened.

## Environments, keys, automation

- **Supabase hosted**: project ref `pdrvinfahqnskuwqumuu` (URL `https://pdrvinfahqnskuwqumuu.supabase.co`). New-format keys (`sb_publishable_*` as anon, `sb_secret_*` as service role) — values live in Vercel env vars, never in the repo.
- **Vercel env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL=https://greenways-jade.vercel.app`, `GOOGLE_MAPS_KEY` (server-side name — code reads it and passes it down; `NEXT_PUBLIC_GOOGLE_MAPS_KEY` also honored), `ANTHROPIC_API_KEY` (Draft Spanish helper). Optional: `NEXT_PUBLIC_MAPBOX_TOKEN` (Mapbox satellite option), `NEXT_PUBLIC_SENTRY_DSN`.
- **GitHub Actions secrets**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. Direct DB access from CI uses the session pooler `postgresql://postgres.pdrvinfahqnskuwqumuu@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.
- **Workflows** (Actions tab, manual unless noted): `CI` (every push/PR); `DB push` — applies `supabase/migrations` to hosted (runs `supabase migration repair --status applied 20260915000001` first because migration 1 was hand-applied via SQL editor; add a repair line for any future hand-applied migration); `Verify deployment` — smoke-checks the live site + RLS + seed; `Diagnose auth` / `Diagnose walk` — probes with exact error bodies; diagnose-walk has a `relock_corners` input that re-locks Lot 4.
- **Auth email**: Gmail Workspace SMTP (`smtp.gmail.com:587`, app password, sender/username `info@texasgreenerpastures.com`). Email templates for **Magic Link** and **Confirm signup** are customized to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (cross-device safe). `/auth/confirm` also accepts the PKCE `?code=` shape.

## Gotchas that will bite you (all learned the hard way)

1. **A 404 on a walk URL usually means unlocked corners** — guardrail #2: the buyer walk refuses unverified geometry. Fix: Corners tab → "CAD-verified" lock (or the diagnose-walk relock input). Check lock state before debugging anything else.
2. **Claude Code's cloud sandbox cannot reach `*.supabase.co`, `*.vercel.app`, container registries, or raw TCP 5432** (egress proxy). All verification against live systems goes through GitHub Actions workflows — that's why the diagnose/verify workflows exist. Don't burn time trying to curl production from the sandbox; extend a workflow instead.
3. **`lib/supabase/database.types.ts` is hand-maintained** to match the migrations (Docker was blocked where it was written). Keep it in sync when you add columns, or regenerate with `pnpm db:types` where Docker works — shapes are identical.
4. **Corner numbering rule**: corners run clockwise; C1 = the corner immediately *before* the entrance, so C1→C2 crosses the entrance (Lot 4: C1=NW, C2=NE, C3=SE, C4=SW). KML import defaults the entrance to the first edge midpoint; "Move entrance" renumbers, carrying names/stakes/photos with the physical corner.
5. **Playwright E2E signs in via `auth.admin.generateLink` + `/auth/confirm?token_hash=`** (no inbox). Pre-create the auth user first (helper does) or the first verify races. `getByRole("alert")` collides with Next's route announcer — use scoped locators.
6. The position filter's **teleport guard re-seeds after 3 consecutive impossible fixes** (drives between corners, demo jump) — don't "fix" the rejections away.
7. `supabase db push` needs the **migration history repair** noted above; "type already exists" means a migration was hand-applied — repair, don't edit the migration.
8. Sale-status pills: **Fence Post Red is sold lots and errors only** (brand guardrail #7). Harvest Gold/Trailhead Green never as text on cream.
9. Overlays on the walk must not swallow taps — full-screen containers get `pointer-events: none` with the sheet `auto` (arrival card regression, fixed).
10. Demo telemetry is stored with a `demo:` device prefix — filter it in any analytics work.

## Rules that do not bend (from CLAUDE.md — enforce in every change)

Corners only from CAD-verified geometry, locked after verification, unlock = logged admin action. No hard-coded English in buyer components — every buyer string in `messages/en.json` **and** `es.json`. Nothing AI-generated reaches a buyer without a person approving it (`es_reviewed` gates publish; Phase 4 media gets a mandatory review queue). Buyers never need an account or install. One tracked corner at a time, always labeled. GPS honesty copy stays. Brand tokens are the only colors. Secrets in env vars only — never commit. `data/lot4-google-aerial.jpg` is an internal test capture — never serve it to buyers.

## Immediate queue (in order)

1. **Gate 3 field test** (Alton, on-site — HUD spec §12): feed the measured numbers back into `ARRIVE_RADIUS_FT` (`lib/hud/arrival.ts`), boundary thresholds (`lib/hud/boundary.ts`), and filter constants (`lib/hud/filters.ts`). All marked *tune in field*.
2. **Team roster activation** — waiting on emails + roles from Alton (Rosalia, Ferdy, Laura, Joseph, Lizzie). Insert `invites` rows (no emails sent unless the admin presses Send/Resend).
3. **Phase 4 — Higgsfield media pipeline** (plan §3, Gate 4): prompt templating from the Prompt Library, `generation_jobs` queue → Higgsfield API (`HIGGSFIELD_API_KEY` to be added) → side-by-side review queue in the Media tab (approve / reject-with-reason / regenerate from same source frames) → approved assets fill media slots. Credits discipline: intro + entrance first, lock style, then batch corners.
4. **Phase 5** — publish flow (public link + QR, tokenized prospect links), GHL/n8n webhook (calendar `xBSMR6gHnlxKqJfB5Pte`), walk analytics UI on `walk_events`, Monday.com inventory-row link (`MONDAY_API_TOKEN`).
5. Deferred small items: `language_switched` event on the toggle; per-property declination (constant +1.5°E now); Mapbox satellite variant of the buyer mini-map (Google variant shipped; drawn = offline fallback); Lighthouse-in-CI restated for Phase 6 (Lighthouse dropped its PWA category in v12); walk access tokens (Phase 5) — until then any slug with locked corners serves.

## Definition of done, every phase

Deployed preview URL + CI green + a `docs/Gate-N-Phase-Report.md` in the shape of the existing ones (built / tested / placeholder / decisions to check / open risks / inputs needed / gate ask). Alton approves before the next phase starts.
