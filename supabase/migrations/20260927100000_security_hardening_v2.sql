-- Security audit v2 (2026-09-27) — database hardening.
--
-- Closes the confirmed editor-level integrity holes: publishing by INSERT
-- skipped every gate check; locked corners could be renumbered, moved to
-- another property, or joined by brand-new (even pre-locked) rows; the
-- gate's own inputs (test_lot) and a published listing's geometry were
-- freely editable. Also revokes the anon-callable team-email oracle,
-- prunes the rate-limit table globally, re-pins SECURITY DEFINER search
-- paths, and tightens storage.

-- ---------------------------------------------------------------------------
-- 1. Publish gate covers INSERT; test_lot and published geometry are guarded.
-- ---------------------------------------------------------------------------
create or replace function public.guard_property_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- Publishing is a gated status TRANSITION. A row born 'published' would
    -- skip every check below (it cannot even have corners yet), so it is
    -- refused outright rather than special-cased.
    if new.status = 'published' then
      raise exception 'publish_via_update: a property is created as a draft and published through the gate'
        using errcode = 'P0001';
    end if;
    new.published_at := null;
    return new;
  end if;

  -- test_lot encodes "geometry is generated, not CAD-verified" — the very
  -- flag the publish gate reads. Flipping it is an admin action.
  if new.test_lot is distinct from old.test_lot and not public.is_admin() then
    raise exception 'admin_only: changing the test-lot flag is an admin action'
      using errcode = 'P0001';
  end if;

  -- A published listing's geometry is what buyers navigate by (guardrail #2).
  -- Only an admin may change it, and the change joins the audit trail.
  if old.status = 'published'
     and (new.boundary is distinct from old.boundary
          or new.entrance_lat is distinct from old.entrance_lat
          or new.entrance_lng is distinct from old.entrance_lng
          or new.geometry_source is distinct from old.geometry_source) then
    if not public.is_admin() then
      raise exception 'admin_only: editing a published listing''s geometry is an admin action'
        using errcode = 'P0001';
    end if;
    perform public.write_audit('geometry_changed', new.id, '{}'::jsonb);
  end if;

  -- Demo mode decides whether ?demo= can ever drive a walker on this
  -- property — flips are legal for the team but never silent.
  if new.demo_mode is distinct from old.demo_mode then
    perform public.write_audit(
      'demo_mode_changed', new.id, jsonb_build_object('on', new.demo_mode)
    );
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    if new.test_lot then
      raise exception 'test_lot: a generated test lot is not CAD-verified geometry and cannot be published'
        using errcode = 'P0001';
    end if;
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

drop trigger if exists guard_property_update on public.properties;
create trigger guard_property_update
  before insert or update on public.properties
  for each row execute function public.guard_property_update();

-- ---------------------------------------------------------------------------
-- 2. Locked corners are immutable in FULL (number and owner, not just
--    coordinates), and corner INSERTs are guarded at all.
-- ---------------------------------------------------------------------------
create or replace function public.guard_corner_update()
returns trigger
language plpgsql
as $$
begin
  if old.locked and (new.lat is distinct from old.lat or new.lng is distinct from old.lng) then
    raise exception 'corner_locked: unlock before moving corner C%', old.n
      using errcode = 'P0001';
  end if;
  -- Renumbering swaps which label the buyer HUD trusts; re-parenting steals
  -- a verified corner from a listing. Both are the same integrity break as
  -- moving it.
  if old.locked and new.n is distinct from old.n then
    raise exception 'corner_locked: unlock before renumbering corner C%', old.n
      using errcode = 'P0001';
  end if;
  if old.locked and new.property_id is distinct from old.property_id then
    raise exception 'corner_locked: a locked corner cannot move to another property'
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

-- "Locked" must always mean "went through the audited lock step", and a
-- published listing's corner set is settled. The service role (seeding,
-- ingest tooling) and admins keep both abilities; NULL-safe so a plain
-- superuser session (local seed) is unaffected.
create or replace function public.guard_corner_insert()
returns trigger
language plpgsql
as $$
declare
  v_privileged boolean;
  v_status public.property_status;
begin
  v_privileged := coalesce(public.is_admin() or auth.role() = 'service_role', true);
  if new.locked and not v_privileged then
    raise exception 'admin_only: corners are created unlocked; locking is the audited step'
      using errcode = 'P0001';
  end if;
  select status into v_status from public.properties where id = new.property_id;
  if v_status = 'published' and not v_privileged then
    raise exception 'published_property: adding corners to a published listing is an admin action'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_corner_insert on public.corners;
create trigger guard_corner_insert
  before insert on public.corners
  for each row execute function public.guard_corner_insert();

-- ---------------------------------------------------------------------------
-- 3. is_invited stops being an anonymous team-email oracle. The sign-in
--    server action calls it through the service role; the auth.users gate
--    trigger runs as definer and is unaffected.
-- ---------------------------------------------------------------------------
revoke execute on function public.is_invited(text) from public, anon, authenticated;
grant execute on function public.is_invited(text) to service_role;

-- New functions in public should not be born anon-callable (the Supabase
-- default that made is_invited and write_audit exposed in the first place).
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- 4. rate_limits cannot grow without bound: the per-bucket inline prune only
--    cleaned the bucket being hit, so one-off buckets (rotating IPs) lived
--    forever. A cheap probabilistic global sweep keeps the table tiny.
--    CREATE OR REPLACE preserves the existing EXECUTE lockdown.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  delete from rate_limits
  where bucket = p_bucket
    and window_start < v_window - make_interval(secs => p_window_seconds);

  -- ~1% of calls also sweep every stale window, so buckets hit once
  -- (rotating-IP spray) cannot accumulate.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 hours';
  end if;

  insert into rate_limits as r (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
  do update set count = r.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER search paths pinned WITH pg_temp (only rate_limit_hit
--    did this right; pg_temp is otherwise implicitly searched first).
-- ---------------------------------------------------------------------------
alter function public.is_team_member() set search_path = public, pg_temp;
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_invited(text) set search_path = public, pg_temp;
alter function public.write_audit(text, uuid, jsonb) set search_path = public, pg_temp;
alter function public.gate_new_auth_user() set search_path = public, pg_temp;
alter function public.link_new_auth_user() set search_path = public, pg_temp;
alter function public.mark_first_sign_in() set search_path = public, pg_temp;

-- Sequence peeking/bumping by anon (Supabase default USAGE grant): nuisance
-- only, but nothing anonymous has any business touching a sequence here.
revoke usage on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- 6. Storage: destroying capture-protocol photos becomes admin-only (every
--    content table already made DELETE admin-only; app flows replace via
--    upsert and never delete), and the bucket only accepts the media types
--    the product actually stores — text/html and svg can never land behind
--    a signed URL on the storage origin.
-- ---------------------------------------------------------------------------
drop policy if exists property_photos_delete on storage.objects;
create policy property_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-photos' and public.is_admin());

update storage.buckets
set file_size_limit = 209715200, -- 200 MB
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf',
      'application/vnd.google-earth.kml+xml',
      'application/octet-stream'
    ]
where id = 'property-photos';
