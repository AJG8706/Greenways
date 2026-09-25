-- Local/dev seed. `supabase db reset` runs this after migrations.
-- Production seeding of the pilot property happens through the admin UI
-- (KML import), which is what the Gate 2 E2E exercises.

-- Initial invites: Alton (admin, both addresses). The full team roster with
-- roles is a Gate 2 input still to arrive (plan §4).
insert into public.invites (email, role) values
  ('alton@texasgreenerpastures.com', 'admin'),
  ('altonjglenn@gmail.com', 'admin')
on conflict (email) do nothing;

-- Broussard Lot 4 (Gaines Acres) — pilot property from data/lot4_gaines_acres.kml.
-- Corners are the Jefferson CAD parcel polygon, numbered clockwise from the
-- road entrance per the Gate 1 decision: C1=NW, C2=NE, C3=SE, C4=SW.
-- Entrance = midpoint of the Broussard Rd frontage (C1–C2).
with prop as (
  insert into public.properties
    (slug, name, address, county, acres, entrance_lat, entrance_lng,
     boundary, geometry_source, status, es_reviewed, demo_mode)
  values (
    'broussard-lot-4',
    jsonb_build_object(
      'en', 'Broussard Rd — Lot 4 (Gaines Acres)',
      'es', 'Broussard Rd — Lote 4 (Gaines Acres)'
    ),
    '7595 Broussard Rd, Beaumont, TX 77713',
    'Jefferson',
    1.49,
    30.17383135, -94.1958781,
    '{
      "type": "Polygon",
      "coordinates": [[
        [-94.1960614, 30.1739324],
        [-94.1956948, 30.1737303],
        [-94.1956711, 30.1722938],
        [-94.1960369, 30.1722937],
        [-94.1960614, 30.1739324]
      ]]
    }'::jsonb,
    'lot4_gaines_acres.kml · Jefferson CAD parcel polygon, cross-checked against Gaines Acres replat',
    'draft',
    false,
    -- The pilot is the demo/QA property: the Demo tab's simulated-walk
    -- scenarios only run where demo_mode is on. Migration 20260916180000 sets
    -- the same flag on hosted; the seed has to set it here because seeding
    -- runs after migrations on a local `db reset`.
    true
  )
  returning id
)
insert into public.corners (property_id, n, lat, lng, name, stake, locked)
select prop.id, c.n, c.lat, c.lng, c.name, c.stake, true
from prop,
(values
  (1, 30.1739324, -94.1960614,
    jsonb_build_object('en', 'NW corner at the road', 'es', 'Esquina noroeste junto al camino'),
    jsonb_build_object('en', 'Orange-capped rebar, knee height, pink flagging',
                       'es', 'Varilla con tapa naranja a la altura de la rodilla, con cinta rosa')),
  (2, 30.1737303, -94.1956948,
    jsonb_build_object('en', 'NE corner at the road', 'es', 'Esquina noreste junto al camino'),
    jsonb_build_object('en', 'Orange-capped rebar at the fence post, pink flagging',
                       'es', 'Varilla con tapa naranja junto al poste de la cerca, con cinta rosa')),
  (3, 30.1722938, -94.1956711,
    jsonb_build_object('en', 'SE rear corner', 'es', 'Esquina sureste al fondo'),
    jsonb_build_object('en', 'Orange-capped rebar under the big oak, pink flagging',
                       'es', 'Varilla con tapa naranja bajo el roble grande, con cinta rosa')),
  (4, 30.1722937, -94.1960369,
    jsonb_build_object('en', 'SW rear corner', 'es', 'Esquina suroeste al fondo'),
    jsonb_build_object('en', 'Orange-capped rebar, knee height, near the culvert',
                       'es', 'Varilla con tapa naranja a la altura de la rodilla, cerca de la alcantarilla'))
) as c(n, lat, lng, name, stake);

-- Demo scenarios (become the admin Demo tab's launcher in Phase 3).
insert into public.demo_scenarios (property_id, name, config)
select p.id, s.name, s.config
from public.properties p,
(values
  ('clean',    '{"speedFtS": 4.5, "gpsNoiseFt": 6,  "compassErrDeg": 0}'::jsonb),
  ('noisy',    '{"speedFtS": 3.5, "gpsNoiseFt": 18, "compassErrDeg": 0}'::jsonb),
  ('compass',  '{"speedFtS": 4.5, "gpsNoiseFt": 6,  "compassErrDeg": 30}'::jsonb),
  ('boundary', '{"speedFtS": 4.5, "gpsNoiseFt": 6,  "compassErrDeg": 0, "wanderAtCorner": 3}'::jsonb)
) as s(name, config)
where p.slug = 'broussard-lot-4';

-- Local stacks serve the pilot as a published walk: drafts are team-only
-- (the anonymous demo E2E and the Lighthouse budget both hit this URL with
-- no session). The corners above are locked, so the publish gate passes.
update public.properties
set es_reviewed = true, status = 'published'
where slug = 'broussard-lot-4';
