-- Aqari — public seller profiles.
--
-- A listing links to its seller's profile: photo, name, verified badge and
-- the month they joined, above their listings. Listings are already readable
-- by anyone, but profiles rows are readable only by their own account ("own
-- profile is readable"), and that policy is right — a profile row also holds
-- the account's phone, email, push token and alert preferences. So instead of
-- loosening it, this returns the four fields a profile page shows and nothing
-- else. No phone number: it's already on each listing, where the person chose
-- to publish it, and the profile page has no contact buttons.
--
-- Only sellers who have at least one approved listing can be looked up. A
-- UUID isn't guessable, but "has published something" is the line between a
-- seller and an account that merely exists, and there's no reason for a buyer
-- to see the second kind. Admins can look up any account, since reviewing a
-- first listing is exactly when they'd want to see who sent it.
--
-- Callable without signing in, like the listings it describes.

create or replace function public.get_seller_profile(p_owner_id uuid)
returns table (name text, avatar_url text, verified boolean, member_since timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.name,
    p.avatar_url,
    coalesce((select a.verified from agents a where a.owner_id = p.auth_uid limit 1), false),
    p.created_at
  from profiles p
  where p.auth_uid = p_owner_id
    and (
      private.is_admin()
      or exists (
        select 1 from listings l
        where l.owner_id = p_owner_id and l.status = 'approved'
      )
    );
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function; state the intended
-- audience explicitly instead of inheriting that.
revoke execute on function public.get_seller_profile(uuid) from public;
grant execute on function public.get_seller_profile(uuid) to anon, authenticated;

-- Verify with one of your own listings' owner_id:
--   select * from public.get_seller_profile(
--     (select owner_id from listings where status = 'approved' limit 1)
--   );
