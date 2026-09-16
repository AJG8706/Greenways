-- Sale status on properties + honest invite lifecycle.
--
-- 1. Lots are notated available | under_contract | sold in the admin panel
--    (brand guardrail #7: Fence Post Red marks sold lots).
-- 2. Issuing a magic-link OTP creates the auth user *before* any email is
--    opened, so "auth user exists" is not "team member is active". Track the
--    first real sign-in instead, and move invite acceptance to that moment.

create type public.sale_status as enum ('available', 'under_contract', 'sold');

alter table public.properties
  add column sale_status public.sale_status not null default 'available';

alter table public.invites add column last_sent_at timestamptz;
alter table public.team_users add column first_signed_in_at timestamptz;

-- Linking on auth-user creation no longer marks the invite accepted.
create or replace function public.link_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  invite record;
begin
  select * into invite from public.invites where email = new.email::citext;
  if found then
    insert into public.team_users (user_id, email, role)
    values (new.id, new.email::citext, invite.role)
    on conflict (email) do update set user_id = excluded.user_id;
  else
    update public.team_users set user_id = new.id where email = new.email::citext;
  end if;
  return new;
end;
$$;

-- Acceptance = the person actually signed in.
create or replace function public.mark_first_sign_in()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is not null and old.last_sign_in_at is null then
    update public.team_users
      set first_signed_in_at = coalesce(first_signed_in_at, now())
      where user_id = new.id;
    update public.invites
      set accepted_at = coalesce(accepted_at, now())
      where email = new.email::citext;
  end if;
  return new;
end;
$$;

create trigger mark_first_sign_in
  after update on auth.users
  for each row execute function public.mark_first_sign_in();

-- Repair rows created under the old rule: an "accepted" invite whose user
-- never signed in goes back to pending.
update public.invites i
set accepted_at = null
from auth.users u
where i.email = u.email::citext and u.last_sign_in_at is null;

update public.team_users t
set first_signed_in_at = u.last_sign_in_at
from auth.users u
where t.user_id = u.id and u.last_sign_in_at is not null;
