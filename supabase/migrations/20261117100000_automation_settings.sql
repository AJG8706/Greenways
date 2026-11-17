-- Opt-in automations (Alton, Nov 2026): weekly digest + no-show nudges.
-- Both ship OFF; an admin turns each on from Settings → Automations.
--
-- app_settings: tiny key/value store for feature toggles. Service-role
-- only (RLS with zero policies + revoked grants), same posture as
-- service_keys — admin server actions are the only writers.
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from public, anon, authenticated;

-- One nudge per prospect link, ever: the daily no-show pass stamps the
-- links it has already flagged so a contact is never re-nudged.
alter table public.walk_links
  add column if not exists noshow_notified_at timestamptz;
