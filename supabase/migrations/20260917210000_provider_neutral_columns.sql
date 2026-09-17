-- Vendor isolation: the generation vendor lives behind lib/media/provider,
-- and the schema should not name it either. The request-id columns become
-- provider_request_id; nothing else changes (values carry over).

alter table public.generation_jobs
  rename column higgsfield_job_id to provider_request_id;

alter table public.media_assets
  rename column higgsfield_job_id to provider_request_id;

comment on column public.generation_jobs.provider_request_id is
  'The media-generation vendor''s id for this request (vendor set in lib/media/provider).';
