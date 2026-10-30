-- The prospect's phone on the link (optional, sent by the booking flow when
-- it issues the link). Walk milestones forward it so the GoHighLevel inbound
-- webhook workflow can always match the contact by phone — GHL workflows
-- match on phone/email, not on a raw contact id.
alter table public.walk_links
  add column if not exists contact_phone text;
