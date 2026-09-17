-- Monday.com integration (plan §3 Phase 5): each Greenways property can be
-- pinned to exactly one row ("Property") on the Inventory Information board,
-- picked once in the Publish tab. The integration writes ONLY the
-- "Greenways Walk" link column on that row — the board stays the marketing
-- team's surface.

alter table public.properties
  add column if not exists monday_item_id text;

comment on column public.properties.monday_item_id is
  'Monday.com item id on the Inventory board that receives this property''s walk link.';
