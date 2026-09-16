-- Per-property demo mode + synthetic test lots for live-GPS field testing.
--
-- 1. `demo_mode` decides whether the buyer walk will accept the simulated
--    walker at all. Off by default: a property serves live GPS and nothing
--    else, so a `?demo=` on a real listing's link cannot quietly replace a
--    buyer's position with a simulation. The pilot property is switched on
--    here so the existing Demo tab keeps working exactly as it does today.
--
-- 2. `test_lot` marks geometry that was generated rather than imported from a
--    CAD-verified KML. Guardrail #2 says buyers only ever see CAD geometry, so
--    a test lot can never reach 'published' — enforced in the trigger below,
--    not just the UI. It exists so the team can exercise the real GPS walk on
--    any patch of ground (an office parking lot, a park) without driving to a
--    listed property.

alter table public.properties
  add column if not exists demo_mode boolean not null default false,
  add column if not exists test_lot boolean not null default false;

comment on column public.properties.demo_mode is
  'Buyer walk may run the simulated walker (?demo=scenario). Off = live GPS only.';
comment on column public.properties.test_lot is
  'Geometry is a generated test square, not CAD-verified. Can never be published.';

-- The pilot keeps its demo scenarios (Gate 3 behaviour, unchanged).
update public.properties set demo_mode = true where slug = 'broussard-lot-4';

-- Publish gate, extended: a generated test lot is never buyer-facing.
create or replace function public.guard_property_update()
returns trigger
language plpgsql
as $$
begin
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

-- ---------------------------------------------------------------------------
-- Hillmont office test lot — live-GPS field test target (not a listing).
-- ---------------------------------------------------------------------------
-- Centre: 7676 Hillmont St, Houston, TX 77040 (Northwest Crossing II), at
-- 29.8437125, -95.5059483 — the OSM building-level match, corroborated by the
-- US Census geocoder to ~0.0001 degrees of latitude. Corners are a generated
-- 100 ft-radius square (141 ft sides, 0.46 ac) around that point, clockwise
-- C1=NW C2=NE C3=SE C4=SW with the entrance at the midpoint of the north edge,
-- matching the corner-numbering rule. `demo_mode` stays false: this property
-- exists precisely to exercise real device GPS.
--
-- The exact square can be dropped anywhere on the satellite map from the
-- Corners tab ("Place test square"), which is how it gets nudged onto the
-- open parking lot that actually gets walked.
with prop as (
  insert into public.properties
    (slug, name, address, county, acres, entrance_lat, entrance_lng,
     boundary, geometry_source, status, es_reviewed, demo_mode, test_lot)
  values (
    'hillmont-gps-test',
    jsonb_build_object(
      'en', 'Hillmont Office — GPS test lot',
      'es', 'Oficina Hillmont — lote de prueba GPS'
    ),
    '7676 Hillmont St, Houston, TX 77040',
    'Harris',
    0.46,
    29.8439074, -95.5059483,
    '{
      "type": "Polygon",
      "coordinates": [[
        [-95.5061715, 29.8439074],
        [-95.5057251, 29.8439074],
        [-95.5057251, 29.8435176],
        [-95.5061715, 29.8435176],
        [-95.5061715, 29.8439074]
      ]]
    }'::jsonb,
    'Synthetic test square — generated for GPS field testing, NOT CAD-verified',
    'draft',
    false,
    false,
    true
  )
  on conflict (slug) do nothing
  returning id
)
insert into public.corners (property_id, n, lat, lng, name, stake, locked)
select prop.id, c.n, c.lat, c.lng, c.name, c.stake, true
from prop,
(values
  (1, 29.8439074, -95.5061715,
    jsonb_build_object('en', 'NW test corner', 'es', 'Esquina noroeste de prueba'),
    jsonb_build_object('en', 'No stake — this is a generated test corner, walk to the arrow',
                       'es', 'Sin estaca — esquina de prueba generada, camine hacia la flecha')),
  (2, 29.8439074, -95.5057251,
    jsonb_build_object('en', 'NE test corner', 'es', 'Esquina noreste de prueba'),
    jsonb_build_object('en', 'No stake — this is a generated test corner, walk to the arrow',
                       'es', 'Sin estaca — esquina de prueba generada, camine hacia la flecha')),
  (3, 29.8435176, -95.5057251,
    jsonb_build_object('en', 'SE test corner', 'es', 'Esquina sureste de prueba'),
    jsonb_build_object('en', 'No stake — this is a generated test corner, walk to the arrow',
                       'es', 'Sin estaca — esquina de prueba generada, camine hacia la flecha')),
  (4, 29.8435176, -95.5061715,
    jsonb_build_object('en', 'SW test corner', 'es', 'Esquina suroeste de prueba'),
    jsonb_build_object('en', 'No stake — this is a generated test corner, walk to the arrow',
                       'es', 'Sin estaca — esquina de prueba generada, camine hacia la flecha'))
) as c(n, lat, lng, name, stake)
on conflict (property_id, n) do nothing;
