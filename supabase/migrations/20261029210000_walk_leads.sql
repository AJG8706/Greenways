-- Phase A of the conversion features (Alton, Oct 29): buyer lead capture.
-- A buyer who finishes the walk can leave a phone number ("I'm interested").
-- Buyers are anonymous, so inserts go through the service-role API route
-- (/api/walk-leads) — RLS keeps the table closed to anon; the team reads.

create table public.walk_leads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  session_id uuid references public.walk_sessions (id) on delete set null,
  locale text not null default 'en',
  name text,
  phone text not null,
  created_at timestamptz not null default now()
);

create index walk_leads_property_idx on public.walk_leads (property_id, created_at desc);

alter table public.walk_leads enable row level security;

create policy walk_leads_select on public.walk_leads
  for select to authenticated using (public.is_team_member());
-- No insert/update policies on purpose: buyer submissions arrive through the
-- service role only. Admins may delete (spam cleanup).
create policy walk_leads_delete on public.walk_leads
  for delete to authenticated using (public.is_admin());
