-- Visitor identity + swipe-to-interest (Alton, Nov 2).
--
-- 1. walk_links.contact_name: the booking flow knows who the link is for;
--    storing the name makes the admin Visitor log read as people, not
--    device strings — Greenways-side audit of who saw the property,
--    independent of GHL.
-- 2. walk_leads grows a source ('form' | 'swipe') and phone becomes
--    nullable: a booked prospect's swipe submits without typing — their
--    phone/name come from the link when present.

alter table public.walk_links
  add column if not exists contact_name text;

alter table public.walk_leads
  add column if not exists source text not null default 'form';

alter table public.walk_leads
  alter column phone drop not null;
