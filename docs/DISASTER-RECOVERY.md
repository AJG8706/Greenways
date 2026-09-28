# Greenways — Disaster Recovery & Contingency Plan (v1)

The plan for a corrupt database, destroyed data, a bad deploy, or a
compromised account — what protects us today, the exact recovery steps, and
what changes before Greenways is sold as a service to outside agents.
Written 2026-09-28 after security audit v2. Owner: Alton. Review every gate.

## Recovery objectives (current, single-tenant)

| Layer | RPO (max data loss) | RTO (time to restore) | Mechanism |
|---|---|---|---|
| Code + config | 0 (git) | ~5 min | Vercel rollback / git revert |
| Database | 24 h | ~1–2 h | Nightly verified dump (ours) + Supabase daily snapshot (theirs) |
| Storage (photos/clips) | ⚠️ no backup yet | re-shoot / regenerate | Manifest only — see gap #1 |
| Secrets | n/a | ~30 min | Re-issue from each provider |

## What protects each layer today

**Code.** Everything is in git (GitHub, private). Every merge to `main` passed
CI (typecheck, lint, 87 unit tests, full E2E on a disposable Supabase stack,
Lighthouse budget). Vercel keeps every previous production deployment
immutable — recovery from a bad deploy is "promote the previous one," no
rebuild needed. Schema lives in `supabase/migrations/` (append-only), so the
database STRUCTURE is reproducible from the repo alone at any commit.

**Database — two independent backups:**
1. *Supabase Pro daily snapshots* (platform-managed, ~7-day window, restore
   from the dashboard: Database → Backups). Zero effort, but it's inside the
   same vendor account it protects.
2. *Our own nightly dump* — `.github/workflows/db-backup.yml` (daily
   ~4:17am CT + on-demand). Produces the official Supabase restore format
   (`roles.sql`, `schema.sql`, `data.sql` incl. auth users), **verifies row
   counts against the live database before uploading** (a backup that
   doesn't restore is theater), and stores 30 days of restore points as
   private-repo artifacts. This survives a Supabase account problem; only
   repo collaborators can download it.

**Storage.** Private bucket, mime-whitelisted, signed-URL-only. The nightly
job records a full object manifest (path, size, timestamps) so after a loss
we know exactly what's missing — but the FILES are not yet copied anywhere
(gap #1 below). Generated clips are re-creatable (jobs table keeps the
prompt + source frames; regenerate via the Media tab). Capture photos are
originals from phones — until gap #1 closes, keep phone-side copies (iCloud/
Google Photos on the shooting phone is the interim backup).

**Data-corruption blast-radius limits already in place** (audit v2): RLS on
every table, publish/lock gates enforced in the database (not just the UI),
locked corners fully immutable, published geometry admin-only + audited,
append-only audit log that survives property deletion, deletes admin-only
everywhere. Most "corruption" scenarios are stopped before they write.

## Scenario runbook

### A. Bad deploy (site broken, DB fine)
1. Vercel dashboard → greenways → Deployments → previous Ready deployment →
   ⋯ → *Promote to Production*. Live in ~1 min.
2. Fix forward in git; never patch in the dashboard.

### B. Bad migration reached production
There are no down-migrations (by design — forward-only history).
1. If the app is broken but data is intact: roll the APP back (A) to the
   commit before the migration; the old code usually tolerates additive
   schema. Then write a corrective migration and ship it through CI + db-push.
2. If the migration damaged data: treat as C.
3. Never edit or delete an applied migration file; always add a new one.

### C. Data corruption / accidental deletion
1. **Stop writes**: Supabase dashboard → Settings → pause the project, or at
   minimum unpublish affected properties so buyers see nothing wrong.
2. Establish the damage window from `audit_log` (Activity page or SQL) — it
   is append-only and survives deletes.
3. Small, surgical loss (one property, one table): restore the latest
   backup artifact into a LOCAL stack (`supabase start` → `psql` the three
   files in order: roles, schema, data), extract the lost rows, re-insert
   into prod via the Management API or a one-off migration. The db-push /
   diagnose workflows are the template for prod SQL access.
4. Widespread corruption: restore whole-database — either Supabase
   dashboard point-restore to a daily snapshot, or fresh project + our
   three-file dump (`psql -f roles.sql`, `schema.sql`, `data.sql`), then
   repoint `SUPABASE_*` env vars in Vercel + GitHub secrets. Expect ~1–2 h.
5. Anything restored from "yesterday" loses that day's walk telemetry —
   acceptable; listings/corners/media state is what matters.

### D. Storage loss
1. Diff the latest `storage-manifest.json` against the bucket to enumerate
   losses.
2. Regenerate generated clips from their jobs (Media tab), re-upload capture
   photos from phone-side copies, re-run the review queue (guardrail #3 —
   nothing reaches buyers unapproved, even during recovery).

### E. Compromised team account or leaked key
1. Team tab → remove the member (kills session, invite, auth user in one
   action; their magic links die with the auth user).
2. Rotate in this order, worst-first: Supabase service-role key (dashboard →
   Settings → API → rotate; update Vercel env + GitHub secret + redeploy),
   `N8N_WEBHOOK_SECRET`, public API keys (Team tab → revoke/re-issue),
   `SUPABASE_ACCESS_TOKEN`, Higgsfield/Monday/Anthropic keys.
3. Read `audit_log` for the account's actions; repair via C if needed.
   Locked corners, published geometry, and the publish gate limited what a
   non-admin account could have damaged.

### F. Supabase or Vercel outage (nothing corrupt, just down)
Wait it out — buyers get the offline PWA if they'd already opened the walk.
Don't restore during a vendor incident; restoring onto a moving target makes
it worse. Status pages: status.supabase.com, vercel-status.com.

## Drills (a plan that's never run is a guess)
- The backup workflow verifies itself nightly (row counts vs live).
- **Quarterly restore drill** (~30 min): download the latest artifact,
  `supabase start` locally, psql the three files, open the admin against the
  local stack, confirm properties/corners/photos manifest line up. Log the
  date + result at the bottom of this file.

## Gaps, in priority order
1. **Storage file backup** — manifest only today. Close before pilot launch:
   weekly workflow that mirrors the bucket (service-role download → artifact
   while small; R2/S3 sync once media outgrows artifacts).
2. **PITR** — Supabase point-in-time recovery is a paid add-on that turns
   RPO from 24 h into ~2 min. Not worth it pre-revenue; flip it on the day
   real agent/buyer traffic starts.
3. **Backup encryption** — artifacts are plaintext behind repo access
   (contains team emails, all listing data). Encrypt with `age` before the
   collaborator list grows past the team.
4. **Staging project** — migrations currently go CI-local → prod. A cheap
   staging Supabase project catches data-shape surprises CI can't.

## When this becomes a paid service for agents

The moment an outside agent pays for a listing walk, recovery stops being an
inconvenience and becomes a contract. Decisions to bake in as we build —
cheap now, expensive to retrofit:

- **Tenancy = an `orgs` table + `org_id` on every tenant-owned row, enforced
  by RLS** (same pattern as today's team RLS, one level up). This single
  choice makes everything below possible; bolting it on later is a rewrite.
- **Per-tenant restore**: with `org_id` everywhere, restoring one agent's
  deleted listing from a dump is a filtered extract, not an all-tenants
  rollback. An all-tenant restore that loses another tenant's day of edits
  is not acceptable once two tenants exist.
- **Per-tenant export**: agents will demand their data (and it's the
  credible answer to "what if you disappear?"). The v1 public API already
  proves the shape — an org-scoped export endpoint is a small step.
- **SLA math**: PITR on (RPO minutes), quarterly drills become monthly, and
  publish honest numbers (e.g. 99.9 % / RPO 15 min / RTO 4 h) rather than
  inheriting whatever the stack does.
- **Isolation of blast radius**: audit v2's DB-enforced gates already mean a
  compromised tenant user can't cross tenants ONLY IF RLS carries org_id —
  another reason it's the keystone.
- **Ops surface**: status page, incident-notification email list, backup
  encryption (gap #3) becomes mandatory, and the DR drill log below becomes
  evidence you show enterprise agents.
- **Migration policy**: expand-contract only (add column → backfill → switch
  reads → drop later), so a rollback of code never fights the schema while
  paying tenants are live.

## Drill log
| Date | Type | Result |
|---|---|---|
| _none yet_ | | |
