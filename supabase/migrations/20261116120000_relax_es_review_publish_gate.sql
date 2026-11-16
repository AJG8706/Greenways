-- Relax the publish gate: Spanish review no longer blocks publish
-- (guardrail #6 relaxed by Alton, Nov 2026 — the review flag kept blocking
-- publishes after routine content saves cleared it). The es_reviewed flag,
-- the Content-tab review workflow and the EN/ES catalogs all stay; review
-- is now tracked, not enforced. Locked corners and the test-lot refusal
-- still gate publish exactly as before.
--
-- Function body copied from 20260927100000_security_hardening_v2.sql with
-- only the es_unreviewed raise removed.

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
