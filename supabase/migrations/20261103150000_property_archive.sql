-- Archive sold properties (Alton, Nov 3): out of the daily admin list and
-- off the buyer side, with every stat, lead and walk session kept and still
-- viewable on the property's own pages. Reversible; team-wide; audited from
-- the server action (property_archived / property_unarchived).
alter table public.properties
  add column if not exists archived_at timestamptz;
