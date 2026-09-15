-- Greenways v1 data model (CLAUDE.md §Data model) + invite-only auth gate.
-- RLS on every table. Guardrail #2 (CAD-verified corner lock) is enforced in
-- triggers, not just UI; unlocking is admin-only and logged in audit_log.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.team_role as enum ('admin', 'editor');
create type public.property_status as enum ('draft', 'generating', 'review', 'published', 'error');
create type public.media_status as enum ('generated', 'approved', 'rejected');
create type public.link_kind as enum ('public', 'prospect');

-- ---------------------------------------------------------------------------
-- Team + invites (invite-only magic links)
-- ---------------------------------------------------------------------------
create table public.team_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete cascade,
  email citext unique not null,
  display_name text,
  role public.team_role not null default 'editor',
  created_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  role public.team_role not null default 'editor',
  invited_by uuid references public.team_users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Membership helpers. SECURITY DEFINER so policies on team_users itself never recurse.
create or replace function public.is_team_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.team_users where user_id = (select auth.uid()));
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_users
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Friendly pre-check for the sign-in form ("that email isn't on the team yet").
-- Callable by anon: it reveals invite status by design for this internal tool.
create or replace function public.is_invited(check_email text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.invites where email = check_email::citext)
      or exists (select 1 from public.team_users where email = check_email::citext);
$$;

-- Hard gate: only invited emails may become auth users (magic links included).
create or replace function public.gate_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_invited(new.email) then
    raise exception 'not_invited: % has no Greenways invite', new.email
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger gate_new_auth_user
  before insert on auth.users
  for each row execute function public.gate_new_auth_user();

-- On first sign-in, promote the invite to a team_users row.
create or replace function public.link_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  invite record;
begin
  select * into invite from public.invites where email = new.email::citext;
  if found then
    insert into public.team_users (user_id, email, role)
    values (new.id, new.email::citext, invite.role)
    on conflict (email) do update set user_id = excluded.user_id;
    update public.invites set accepted_at = now()
      where id = invite.id and accepted_at is null;
  else
    -- Email already in team_users (re-created auth user): relink.
    update public.team_users set user_id = new.id where email = new.email::citext;
  end if;
  return new;
end;
$$;

create trigger link_new_auth_user
  after insert on auth.users
  for each row execute function public.link_new_auth_user();

-- ---------------------------------------------------------------------------
-- Audit log (unlocks, entrance moves, publishes — admin actions worth a trail)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  property_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.write_audit(
  p_action text,
  p_property_id uuid,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.audit_log (actor, action, property_id, detail)
  values ((select auth.uid()), p_action, p_property_id, p_detail);
$$;

-- ---------------------------------------------------------------------------
-- Properties + corners
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name jsonb not null default '{"en": "", "es": ""}'::jsonb,
  address text,
  county text,
  acres numeric(8, 2),
  entrance_lat double precision,
  entrance_lng double precision,
  boundary jsonb, -- GeoJSON Polygon, CAD-verified KML source only (guardrail #2)
  geometry_source text, -- e.g. "lot4_gaines_acres.kml · Jefferson CAD parcel polygon"
  status public.property_status not null default 'draft',
  -- "Reviewed by a person" flag for AI-drafted Spanish. Blocks publish while false.
  es_reviewed boolean not null default false,
  es_reviewed_by uuid references public.team_users (id) on delete set null,
  es_reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.corners (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  n int not null check (n >= 1),
  lat double precision not null,
  lng double precision not null,
  name jsonb not null default '{"en": "", "es": ""}'::jsonb,
  stake jsonb not null default '{"en": "", "es": ""}'::jsonb,
  approach_photo text, -- storage path in property-photos
  stake_photo text,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, n)
);

-- Guardrail #2 in the database: locked corner geometry cannot move, and only an
-- admin can unlock. Both lock transitions are written to audit_log.
create or replace function public.guard_corner_update()
returns trigger
language plpgsql
as $$
begin
  if old.locked and (new.lat is distinct from old.lat or new.lng is distinct from old.lng) then
    raise exception 'corner_locked: unlock before moving corner C%', old.n
      using errcode = 'P0001';
  end if;
  if old.locked and not new.locked then
    if not public.is_admin() then
      raise exception 'admin_only: unlocking corners is an admin action'
        using errcode = 'P0001';
    end if;
    perform public.write_audit(
      'corner_unlocked', old.property_id,
      jsonb_build_object('corner', old.n, 'lat', old.lat, 'lng', old.lng)
    );
  end if;
  if new.locked and not old.locked then
    perform public.write_audit(
      'corner_locked', old.property_id,
      jsonb_build_object('corner', old.n, 'lat', new.lat, 'lng', new.lng)
    );
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_corner_update
  before update on public.corners
  for each row execute function public.guard_corner_update();

-- Publish gate: unreviewed Spanish or unlocked/missing corners block 'published'.
create or replace function public.guard_property_update()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if not new.es_reviewed then
      raise exception 'es_unreviewed: Spanish must be reviewed by a person before publish'
        using errcode = 'P0001';
    end if;
    if exists (select 1 from public.corners c where c.property_id = new.id and not c.locked)
       or not exists (select 1 from public.corners c where c.property_id = new.id) then
      raise exception 'corners_unverified: all corners must be CAD-verified and locked before publish'
        using errcode = 'P0001';
    end if;
    new.published_at := now();
    perform public.write_audit('property_published', new.id, '{}'::jsonb);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_property_update
  before update on public.properties
  for each row execute function public.guard_property_update();

-- ---------------------------------------------------------------------------
-- Media + generation (Phase 4 fills these; capture photos use them now)
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  type text not null check (type in ('capture', 'image', 'video')),
  slot text not null, -- e.g. entrance_360, homesite_360, gate, aerial, corner_1_approach
  storage_path text not null,
  status public.media_status not null default 'generated',
  source_photo text,
  higgsfield_job_id text,
  reject_reason text,
  created_at timestamptz not null default now()
);

-- One capture photo per slot per property (re-upload replaces).
create unique index media_assets_capture_slot
  on public.media_assets (property_id, slot)
  where type = 'capture';

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null,
  status text not null default 'queued',
  higgsfield_job_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Links, sessions, events (Phase 3/5 fill these)
-- ---------------------------------------------------------------------------
create table public.walk_links (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind public.link_kind not null,
  token text unique not null,
  ghl_contact_id text,
  locale text check (locale in ('en', 'es')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.walk_sessions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid references public.walk_links (id) on delete set null,
  locale text check (locale in ('en', 'es')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  device text
);

create table public.walk_events (
  id bigint generated always as identity primary key,
  session_id uuid references public.walk_sessions (id) on delete cascade,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.demo_scenarios (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties (id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS — every table
-- ---------------------------------------------------------------------------
alter table public.team_users enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;
alter table public.properties enable row level security;
alter table public.corners enable row level security;
alter table public.media_assets enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.walk_links enable row level security;
alter table public.walk_sessions enable row level security;
alter table public.walk_events enable row level security;
alter table public.demo_scenarios enable row level security;

-- Team roster: members read; admins manage.
create policy team_users_select on public.team_users
  for select to authenticated using (public.is_team_member());
create policy team_users_admin_insert on public.team_users
  for insert to authenticated with check (public.is_admin());
create policy team_users_admin_update on public.team_users
  for update to authenticated using (public.is_admin());
create policy team_users_admin_delete on public.team_users
  for delete to authenticated using (public.is_admin());

-- Invites: members read; admins manage.
create policy invites_select on public.invites
  for select to authenticated using (public.is_team_member());
create policy invites_admin_insert on public.invites
  for insert to authenticated with check (public.is_admin());
create policy invites_admin_update on public.invites
  for update to authenticated using (public.is_admin());
create policy invites_admin_delete on public.invites
  for delete to authenticated using (public.is_admin());

-- Audit log: members read; rows are written via write_audit (security definer).
create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_team_member());

-- Content tables: members read/write; deletes are admin-only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'properties', 'corners', 'media_assets', 'generation_jobs',
    'walk_links', 'demo_scenarios'
  ]
  loop
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.is_team_member());',
      t, t);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.is_team_member());',
      t, t);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.is_team_member());',
      t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.is_admin());',
      t, t);
  end loop;
end;
$$;

-- Walk telemetry: members read. Buyer-side inserts arrive in Phase 3/5 through
-- server routes using the service role (which bypasses RLS by design).
create policy walk_sessions_select on public.walk_sessions
  for select to authenticated using (public.is_team_member());
create policy walk_events_select on public.walk_events
  for select to authenticated using (public.is_team_member());

-- ---------------------------------------------------------------------------
-- Storage: private bucket for capture-protocol photos. Never public — buyer
-- delivery goes through signed URLs / precache manifests in later phases.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('property-photos', 'property-photos', false)
on conflict (id) do nothing;

create policy property_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'property-photos' and public.is_team_member());
create policy property_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-photos' and public.is_team_member());
create policy property_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'property-photos' and public.is_team_member());
create policy property_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-photos' and public.is_team_member());
