-- Phase 4: Higgsfield media pipeline.
--
-- generation_jobs grows the fields the queue needs (exact slot, the provider's
-- status URL, error detail, the seed used) and a status vocabulary that covers
-- the provider lifecycle plus our ingest step. media_assets links back to the
-- job that produced it, and the review rules become database rules:
-- a rejection always carries a reason, and approve/reject are audit-logged.
-- Guardrail #3 (nothing generated reaches a buyer unapproved) is enforced at
-- read time — buyer surfaces only ever select status = 'approved' — and the
-- audit trail here is what makes the review pass accountable.

-- Free-text variables the Prompt Library templates need (road name, defining
-- features, ground cover, homesite and entrance descriptions). Defaults are
-- derived from the record; the Media tab lets the team refine them before
-- spending credits.
alter table public.properties
  add column if not exists media_brief jsonb not null default '{}'::jsonb;

comment on column public.properties.media_brief is
  'Prompt Library variables: {road, features, groundCover, homesite, entrance}.';

alter table public.generation_jobs
  add column if not exists slot text not null default '',
  add column if not exists status_url text,
  add column if not exists error text,
  add column if not exists seed integer;

comment on column public.generation_jobs.slot is
  'Media slot this job fills, e.g. intro, entrance, homesite, corner_1_approach.';
comment on column public.generation_jobs.status_url is
  'Absolute status URL returned by the Higgsfield submit call; polled verbatim.';
comment on column public.generation_jobs.seed is
  'Seed sent with the generation. Regenerations reuse the payload with a new seed.';

-- queued        submitted to Higgsfield, awaiting execution
-- in_progress   provider is generating
-- completed     provider finished; asset not yet ingested to storage (retryable)
-- ingested      asset downloaded into property-photos and a media_assets row exists
-- failed        provider errored (credits refunded per provider docs)
-- nsfw          provider moderation rejected the generation
-- canceled      canceled before execution
alter table public.generation_jobs
  drop constraint if exists generation_jobs_status_check;
alter table public.generation_jobs
  add constraint generation_jobs_status_check check (
    status in ('queued', 'in_progress', 'completed', 'ingested', 'failed', 'nsfw', 'canceled')
  );

alter table public.media_assets
  add column if not exists job_id uuid references public.generation_jobs (id) on delete set null;

-- One ingested asset per job: concurrent polls (interval + manual refresh)
-- must not double-ingest a completed generation.
create unique index if not exists media_assets_job_unique
  on public.media_assets (job_id)
  where job_id is not null;

-- A rejection without a reason is not a review (Prompt Library review pass).
alter table public.media_assets
  drop constraint if exists media_assets_reject_reason_check;
alter table public.media_assets
  add constraint media_assets_reject_reason_check check (
    status <> 'rejected' or reject_reason is not null
  );

-- Review decisions are logged with who/what/why.
create or replace function public.audit_media_review()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.write_audit(
      'media_' || new.status::text,
      new.property_id,
      jsonb_build_object(
        'asset_id', new.id,
        'slot', new.slot,
        'reason', new.reject_reason
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists media_assets_review_audit on public.media_assets;
create trigger media_assets_review_audit
  after update on public.media_assets
  for each row execute function public.audit_media_review();
