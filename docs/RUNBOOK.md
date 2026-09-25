# Greenways Runbook

Operations reference for whoever is on the hook when something breaks.
Companion to `docs/TEAM-GUIDE.md` (how the team *uses* the console) and
`docs/PROJECT-RUNDOWN.md` (full technical hand-off). Owner: Alton Glenn.

## The system in one paragraph

Next.js app on **Vercel** (project `greenways`, production = `main`,
https://greenways-jade.vercel.app), database/auth/storage on **Supabase**
(project ref `pdrvinfahqnskuwqumuu`), code on **GitHub**
(`AJG8706/Greenways`). Merging to `main` deploys production. Database
changes ship as files in `supabase/migrations/` and are applied to the
hosted database by the **DB push** GitHub Action — deploying code does
NOT apply migrations; forgetting DB push after a migration PR is the #1
way to break the admin console.

## Where things run

| Thing | Where | Notes |
|---|---|---|
| App hosting + deploys | Vercel (Pro) | every PR gets a preview URL; `main` = production |
| Postgres, auth, file storage | Supabase (Pro) | private bucket `property-photos`; RLS on every table |
| Media generation | Higgsfield API | isolated in `lib/media/provider/`; no key = mock mode |
| Walk analytics forward | GA4 (optional) | `lib/analytics/`; demo sessions never forwarded |
| Inventory link | Monday.com | writes only the "Greenways Walk" column |
| Booking → walk link | n8n → `POST /api/links/issue` | gated by `N8N_WEBHOOK_SECRET` |
| External tools | `/api/v1` | bearer keys from Team tab; `docs/API.md` |
| Errors | Sentry (if DSN set) + Vercel logs | Vercel → project → Logs for server errors |

## Secrets (never in the repo)

- **Vercel env vars** (Vercel → greenways → Settings → Environment
  Variables): Supabase URL + anon key + service-role key,
  `NEXT_PUBLIC_SITE_URL`, `HIGGSFIELD_API_KEY` (`id:secret`),
  `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (browser Maps key — referrer-restrict it
  to the production domains and API-restrict to Maps JavaScript API in
  Google Cloud; it ships to buyers by design), `ANTHROPIC_API_KEY`, `N8N_WEBHOOK_SECRET`,
  `MONDAY_API_TOKEN`, optional `GA4_MEASUREMENT_ID`/`GA4_API_SECRET`,
  `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`. Change → redeploy.
- **GitHub Actions secrets** (repo → Settings → Secrets → Actions):
  `SUPABASE_ACCESS_TOKEN` (a personal access token from the Supabase
  account page — **if DB push says "Unauthorized", regenerate this**),
  `SUPABASE_DB_PASSWORD`.
- **API keys for external tools**: minted in the console (Team →
  API keys), shown once, revocable there. Never in email or docs.

## The workflows (GitHub → Actions tab, all manual unless noted)

- **CI** — every push/PR: lint, typecheck, unit tests, build, Playwright
  E2E against a real local Supabase, then a Lighthouse gate on the buyer
  walk (budgets + perf floor + a11y ≥ 0.95; report saved as an artifact).
  CI must be green to merge.
- **DB push** — applies `supabase/migrations` to the hosted database.
  Run it after every merged PR that adds a migration.
- **Verify deployment** — smoke-checks the live site, RLS, and seed data.
  Run it after anything scary.
- **Diagnose auth / Diagnose walk / Diagnose media** — read-only probes
  with exact error bodies. Diagnose walk takes a property slug and an
  optional `relock_corners`; Diagnose media takes a slug and optional
  `cancel_active`.

## Playbooks

### A buyer link 404s
1. Corners locked? (Overview checklist → verify stage, or Diagnose walk.)
   Guardrail: unlocked corners always take the walk offline.
2. Published? Walk serves only when `status = published` (demo/test lots
   exempt). Publish tab shows what's blocking (Spanish review, corners).
3. Prospect link revoked/expired degrades to the public link — the walk
   still serves; only attribution is lost.

### Media generation stuck or failing
1. Media tab → Test connection. "auth OK · N camera moves" = credentials
   good. 401 = rotate `HIGGSFIELD_API_KEY` in Vercel and redeploy.
2. A rejected clip auto-queues a regeneration — "stuck generating" right
   after a reject is usually just the regen running.
3. Diagnose media (slug; `cancel_active: true` to clear a wedged job).
4. No key at all = labeled mock mode: flow works, placeholder clips.

### Admin console erroring after a deploy
Almost always a migration gap: the code expects a column the hosted DB
doesn't have. Run **DB push**. If it fails Unauthorized → regenerate
`SUPABASE_ACCESS_TOKEN` (see Secrets). Roll back = revert the PR on
`main` (Vercel redeploys the revert automatically).

### Sign-in emails not arriving
Supabase → Auth → SMTP: Gmail Workspace (`info@texasgreenerpastures.com`,
app password). Check spam; check the Supabase auth logs. The sign-in page
only sends to invited emails — an uninvited address gets a friendly
refusal, not an email.

### Suspected API key leak
Team tab → API keys → Revoke (immediate). Create a replacement, update
the one tool that used it. `last_used_at` shows whether it was used.
Activity page shows key creation/revocation history.

### Who changed / deleted something?
Admin sidebar → **Activity**: sign-ins and every guarded action (locks,
publishes, media decisions, uploads, key events), append-only.

## Backups & data safety

- Supabase Pro takes **daily automatic backups (7-day retention)**:
  dashboard → Database → Backups → restore. A restore replaces the whole
  database — treat as last resort and expect to lose the day's edits.
- Deletes in the app are admin-only, audited, and cascaded; uploaded
  photos/clips live in the `property-photos` bucket and are removed
  best-effort with the row. Storage is not in DB backups — media can be
  regenerated from source photos; source photos should also live in the
  team's Drive per the capture protocol.
- The repo (migrations + seed) can rebuild an empty environment from
  scratch; the runbook assumption is: **database = Supabase backups,
  media = regenerable, code = GitHub.**

## Deploy discipline

Small PRs into `main`, CI green, merge, and if the PR carried a
migration: DB push immediately after. Preview URLs exist for every PR —
check the preview before merging anything user-visible. Never edit the
hosted database by hand except through the SQL editor in an emergency,
and if you do, record it (a migration repair may be needed — see the
DB push workflow comments).
