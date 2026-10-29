-- Aqari — show each account's name in Dashboard → Authentication → Users.
--
-- The name lives in public.profiles (written when the sign-up code is
-- redeemed). auth.users only ever had the phone, so the Users screen showed
-- an id and a number and nothing else. This copies profiles.name into the
-- user's metadata, which is what that screen's "Display name" column reads,
-- for existing accounts now and on every sign-up or name change after.
--
-- Three keys, because the dashboard has read different ones over time
-- (display_name, full_name, name); writing all three keeps the column filled
-- whichever it reads. The values are the account's own name, which the app
-- already shows that person, so nothing new is exposed to anyone.
--
-- Safe to re-run.

create or replace function private.sync_profile_name_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('display_name', new.name, 'full_name', new.name, 'name', new.name)
  where id = new.auth_uid;
  return new;
end;
$$;

revoke execute on function private.sync_profile_name_to_auth_user() from public, anon, authenticated;

drop trigger if exists profile_name_to_auth_user on public.profiles;

create trigger profile_name_to_auth_user
  after insert or update of name, auth_uid on public.profiles
  for each row
  when (new.auth_uid is not null)
  execute function private.sync_profile_name_to_auth_user();

-- Existing accounts.
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('display_name', p.name, 'full_name', p.name, 'name', p.name)
from public.profiles p
where p.auth_uid = u.id;

-- Check: every account with its name, newest first.
select u.id, u.phone, u.raw_user_meta_data ->> 'display_name' as name, u.created_at
from auth.users u
order by u.created_at desc
limit 20;
