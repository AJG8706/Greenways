-- Phase 6 hardening: fixed-window rate limiting for the public surfaces
-- (/api/v1 bearer keys, the n8n link-issue webhook, walk-event ingest).
-- Serverless-safe: state lives here, one atomic upsert per request via the
-- function below (service role only — the table has no client policies).

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

comment on table public.rate_limits is
  'Fixed-window request counters. Rows expire (2 windows) and are pruned inline by rate_limit_hit.';

alter table public.rate_limits enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) touches it.

-- Count a hit in the bucket''s current window; true = allowed, false = over.
-- Prunes the bucket''s stale windows inline, so the table stays tiny without
-- a scheduler.
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  delete from rate_limits
  where bucket = p_bucket
    and window_start < v_window - make_interval(secs => p_window_seconds);

  insert into rate_limits as r (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
  do update set count = r.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
