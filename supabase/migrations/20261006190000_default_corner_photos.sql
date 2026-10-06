-- Every corner is born with the shared example-pin stand-ins, so a freshly
-- imported subdivision walks well (and its Photos tab reads honestly)
-- before any field photos exist. These two paths are recognized across the
-- app (lib/photos.ts): admin checklists show them as "Example pin in use",
-- assembly readiness and the media pipeline still treat them as "no real
-- photo yet", and the buyer walk renders them from the bundled asset with
-- the bilingual "example photo" caption. Uploading a real photo simply
-- overwrites the pointer.
alter table public.corners
  alter column approach_photo set default 'defaults/corner-approach-default.jpg',
  alter column stake_photo set default 'defaults/corner-pin-default.jpg';
