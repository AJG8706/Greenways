# Greenways

Texas Greener Pastures' property walkthrough app: a desktop admin console and a
mobile buyer walk (bilingual EN/ES). The standing brief is `CLAUDE.md`; the plan
with gates is `docs/TGP-Walkthrough-Project-Plan-v1.md`.

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind (Phase 1 preset +
`greenways.css`) · next-intl (cookie locale, no path prefix) · Supabase
(Postgres, magic-link auth invite-only, Storage, RLS) · MapLibre GL · Vitest ·
Playwright · GitHub Actions.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase keys
pnpm dev
```

With Docker available, run the whole stack locally instead of the hosted project:

```bash
pnpm db:start                # supabase start (applies migrations + seed)
pnpm db:reset                # re-apply migrations + seed
pnpm db:types                # regenerate lib/supabase/database.types.ts
```

`supabase status -o env` prints the local `API_URL` / `ANON_KEY` /
`SERVICE_ROLE_KEY` for `.env.local`.

## Hosted Supabase (one-time setup)

In the Supabase dashboard for the project:

1. **SQL Editor** → run `supabase/migrations/20260915000001_init.sql`, then
   `supabase/seed.sql` (invites + the Broussard Lot 4 pilot record).
2. **Authentication → URL Configuration** → set the Site URL to the deployed
   origin (plus `http://localhost:3000` under additional redirect URLs for dev).
3. Copy the Project URL, publishable (anon) key and secret (service role) key
   into `.env.local` / Vercel env vars — names in `.env.example`.

Alternatively, with a personal access token + DB password:
`supabase link --project-ref <ref> && supabase db push`.

## Tests

```bash
pnpm test        # Vitest — lib/geo + KML (pure functions)
pnpm test:e2e    # Playwright — sign-in → property → KML import → corners; needs a running Supabase
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and the
E2E suite against a local Supabase stack on every push and PR.

## Rules that do not bend

The guardrails in `CLAUDE.md` §Standing guardrails — notably: corners only from
CAD-verified geometry (locked in the DB; unlock is admin-only and audit-logged),
no hard-coded English in buyer components, and nothing AI-generated reaches a
buyer without a person approving it (`es_reviewed` gates publish).

`data/lot4-google-aerial.jpg` is an internal test capture only — never served
to buyers.
