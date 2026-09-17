-- Public API v1: bearer keys for external tools (n8n flows beyond the
-- booking hook, GHL, spreadsheets, future apps). The secret is shown once
-- at creation and only its SHA-256 lands here; admins manage keys from the
-- Team tab. Requests authenticate through the service role, so RLS on this
-- table is admin-only visibility.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text unique not null,
  prefix text not null, -- e.g. "gw_live_3fk2" — enough to recognize, never enough to use
  created_by uuid references public.team_users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

comment on table public.api_keys is
  'Bearer keys for /api/v1. Only the SHA-256 of the secret is stored.';

alter table public.api_keys enable row level security;

create policy api_keys_admin_select on public.api_keys
  for select to authenticated using (public.is_admin());
create policy api_keys_admin_insert on public.api_keys
  for insert to authenticated with check (public.is_admin());
create policy api_keys_admin_update on public.api_keys
  for update to authenticated using (public.is_admin());
create policy api_keys_admin_delete on public.api_keys
  for delete to authenticated using (public.is_admin());
