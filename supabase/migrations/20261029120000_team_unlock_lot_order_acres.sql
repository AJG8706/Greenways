-- Three Phase-5 operability changes (Alton, Oct 29):
--
-- 1. Unlocking corners becomes a TEAM action, not admin-only. The full
--    locked-immutability guard and both audit events stay — every unlock
--    is still logged with who did it (write_audit records the caller).
--    This deliberately relaxes the Phase-1 "unlocking is an admin action"
--    guardrail at Alton's request; CLAUDE.md is updated in the same commit.
-- 2. properties.sort_order — explicit lot ordering under a master tract.
--    Imports number it from the plat (lot.n); the admin Lots table can
--    reorder or re-sort by name. Backfilled from created_at so existing
--    subdivisions keep their current order until someone reorders them.
-- 3. properties.acres_manual — true once the team types an acreage. The
--    survey-geometry calculation stays the default, but a KML re-import
--    no longer overwrites a manually entered (platted) figure.

-- ---------------------------------------------------------------------------
-- 1. guard_corner_update: same body as 20260927100000 minus the admin-only
--    unlock raise. Locked corners stay immutable in full; lock/unlock
--    transitions stay audited.
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
    -- Any team member may unlock (RLS already restricts writes to the team);
    -- the audit row below is the accountability.
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

-- ---------------------------------------------------------------------------
-- 2. Lot ordering under a master tract.
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists sort_order integer not null default 0;

update public.properties p
set sort_order = r.rn
from (
  select id, row_number() over (partition by parent_id order by created_at) as rn
  from public.properties
  where parent_id is not null
) r
where p.id = r.id
  and p.sort_order = 0;

-- ---------------------------------------------------------------------------
-- 3. Manually entered acreage survives KML re-imports.
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists acres_manual boolean not null default false;
