-- Admin activity view (Alton's ask): the audit trail becomes admin-only
-- reading, sign-ins get logged, and the Activity page's query gets an index.

-- Reading the trail is an admin matter; writes still go through write_audit
-- (security definer) from any signed-in session.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
  for select to authenticated using (public.is_admin());

-- The Activity page reads newest-first, occasionally filtered by actor.
create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx
  on public.audit_log (actor, created_at desc);
