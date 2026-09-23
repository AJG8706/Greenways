# Greenways — Gate 6 Phase Report

**Phase 6: Creation automation & production hardening · September 23, 2026 · Status: built and CI-green; awaiting the acceptance run (a second property assembled start-to-finish in under one hour of hands-on time) to close the gate**

## What's built

**The Assemble flow** — a property goes from nothing to published walk down one guided path.

- *KML at creation:* the New-property dialog takes the CAD-verified KML and imports corners in the same step (parse-before-insert; a bad file never leaves a bare row). Test lots keep their generated square and skip the field.
- *Assembly checklist* (Overview tab): eight stages — geometry → verify/lock → protocol photos (with an x/y count) → brief → style lock → corner+homesite clips → Spanish review → publish — derived purely from data (`lib/assembly.ts`), each linking to its tab, next step called out. The checklist cannot disagree with the tabs.
- *Generate remaining:* once intro + entrance are approved, one click queues every slot that has its protocol photos, each through the same guarded single-slot path — credits discipline and source checks hold per slot.
- Hands-on path for a new property: create (KML attached) → verify + lock on the map → upload photos → save brief → generate + approve intro/entrance → Generate remaining → approve clips → mark Spanish reviewed → publish. Everything else is machine time.

**Hardening.**

- *Rate limits* on all three public surfaces, Postgres-backed (no new vendor, serverless-safe; migration `20260923200000`): `/api/v1` 120/min per key with `429` + `Retry-After`; the n8n webhook 60/min plus a 20/min per-IP budget on **failed** auth so the shared secret can't be brute-forced; walk-events 120/min per IP (a real walk uses ~4). Deliberately fails open — a limiter hiccup can never take down a buyer surface.
- *Webhook secret comparison* is constant-time. Token entropy audited: walk-link tokens 128-bit, API keys 256-bit, sha256-only storage.
- *Security review* of the hardening diff ran clean (SQLi, SECURITY DEFINER/PostgREST exposure, header trust, fail-open all explicitly cleared); its `pg_temp` search-path note applied.
- *Fixed in review:* `disclaimer_acknowledged` was missing from the walk-events whitelist — the terms receipt was being dropped server-side. The E2E now asserts the receipt lands in the database.

**Admin activity trail** (Alton's ask): sign-ins log on every magic-link confirmation; the admin-only Activity page shows last sign-in per team member and the latest 200 audit entries (locks/unlocks, publishes, media decisions, uploads, key events) in plain language, linked to their properties. Reads are admin-only (migration `20260923210000`); rows are append-only.

**Invite experience fix** (live team feedback: "didn't request any confirmation"): first-ever sign-in lands on a welcome card explaining the link-is-your-sign-in model; recommended replacement copy for both Supabase email templates is documented (dashboard paste — see rundown).

**Performance & accessibility gate in CI.** Every merge now runs Lighthouse 12 against the seeded buyer walk, emulated mid-range Android, simulated throttling: hard size/timing budgets (`lighthouse-budget.json`), accessibility ≥ 0.95, and a performance floor of **0.70 on the best of three runs** (three runs because shared-runner CPU contention measured a 0.79→0.52 swing on identical code; a real regression sinks all three). Per-run scores and per-script diagnostics print in the job log; reports upload as artifacts.

- *Perf pass shipped:* lazy-loading the maps, media and demo-tray components took the walk from **0.62 → 0.79** (TTI 6.7 s → 4.3 s, LCP 2.7 s, FCP 0.9 s, CLS 0). Accessibility is **1.0** — the Phase 1 design system's reduced-motion and contrast work held up under audit with zero fixes needed.

**Ops docs.** `docs/RUNBOOK.md` (secrets map, workflows, playbooks for every failure mode actually hit, backup posture, deploy discipline) and `docs/TEAM-GUIDE.md` (the console start to finish, in the team's terms). `docs/API.md` and `/api/v1/openapi.json` continue from Phase 5.

**Launch-cost decision — made.** Vercel Pro + Supabase Pro (~$45/mo), upgraded by Alton Sep 23. R2 revisits only if media egress consistently exceeds ~200 GB/mo (≈2,000+ full-precache walks).

**Brand pre-production.** Preliminary USPTO screen on "Greenways" (web-indexed, not a legal opinion): no live GREENWAYS registration surfaced in real-estate services or property-tour software; nearest marks are Greenway Health (medical/EHR software only) and GREENWAY PROPERTY SERVICES (landscaping). Recommendation: attorney knockout search on tmsearch.uspto.gov before physical signage — same attorney pass as the (approved) walk disclaimer.

## What's tested

- **Unit (Vitest, 77):** everything prior, plus the assembly stage engine (stage ordering, photo counting, style-lock gating, pipeline completion) and API key material.
- **E2E (Playwright, green in CI):** create-with-KML lands on a checklist showing verify next with corners imported; Generate remaining queues exactly the ready slots; webhook brute-force sees `429`; admin sees their own sign-in and lock/import entries on Activity while an editor is bounced; the invited editor's first sign-in shows the welcome card; the disclaimer receipt reaches `walk_events`.
- **Migrations** (`20260923200000` rate limits, `20260923210000` audit admin) validated behaviorally on bare Postgres.

## What's placeholder / deferred

- Perf 0.80+ (from 0.79): the shared vendor chunk is the named target (966 ms bootup, 87 KB of 126 KB unused per the CI diagnostics). Floor ratchets up in the PR that earns it.
- Panorama outpaint stills and DoP duration/quality params (deferred since Gate 4; unchanged).
- Timing-budget audit wiring quirk noted (a 6.7 s TTI didn't trip a 6.5 s line); the score floor is the enforcing gate.

## Decisions to check

- Rate-limit budgets (120/60/20/120 per min) are first-pass numbers — revisit against real n8n traffic.
- Activity trail reads are **admin-only**; editors see nothing. Flip to team-wide read is a one-line policy change if wanted.
- Best-of-three Lighthouse gating trades a small chance of missing a marginal regression for zero false-red builds.

## Open risks

- **Two migrations are not yet on the hosted database** — DB push fails `Unauthorized`; the `SUPABASE_ACCESS_TOKEN` repo secret needs regenerating (likely invalidated around the Pro upgrade). Until then the deployed rate limiter no-ops (fails open, by design) and Activity-trail reads follow the old team-wide policy. Five-minute fix, documented in the runbook.
- Supabase email templates still carry stock "Confirm signup" copy until the dashboard paste happens.
- GitHub-side CI remains exposed to registry/runner weather; mitigations shipped (ECR mirror, auth'd pulls, backoff, best-of-three) after three separate live incidents today.

## Inputs needed

1. **Regenerate `SUPABASE_ACCESS_TOKEN`** (Supabase account → Access Tokens) → update the GitHub Actions secret → say the word and the DB push runs.
2. **Paste the email template copy** (provided Sep 23) into Supabase → Auth → Email Templates.
3. **The acceptance run**: a real second property (KML + protocol photos) assembled start-to-finish — the stopwatch on that run closes this gate.
4. Attorney knockout search on "Greenways" before signage goes to print.

## Gate ask

Approve Phase 6 as built, pending the acceptance-run stopwatch. On approval, Phase 7 (pilot & launch) starts: real prospect walk on Broussard Lot 4, stake + QR-sign standard, walk-pack SMS automation live via n8n, team training, ownership handoff.
