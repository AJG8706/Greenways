-- Security audit fix (HIGH): write_audit is SECURITY DEFINER, and Supabase's
-- default privileges grant EXECUTE on public functions to anon — so anyone
-- holding the publishable anon key could forge or flood audit rows through
-- PostgREST (POST /rest/v1/rpc/write_audit) with arbitrary action/detail.
-- Same lockdown rate_limit_hit received in 20260923200000. Authenticated
-- stays: auth is invite-only, so every authenticated user is a team member,
-- and the app's server actions call write_audit with the user session.

revoke execute on function public.write_audit(text, uuid, jsonb) from public, anon;
grant execute on function public.write_audit(text, uuid, jsonb) to authenticated, service_role;
