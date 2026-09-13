-- Aqari — one-time repair for rows left behind by a phone-number change.
--
-- Changing an account's number used to update only the profiles row. The
-- phone is this app's human-facing identity, though, so several other tables
-- key on it: listings.agent_id ("my listings" is agent_id = my phone),
-- listings.agent_phone (the number the call button dials), favorites.user_id,
-- and agents.phone (the seller directory's primary key). All of those kept
-- the old number, which detached the account from its own data — listings
-- disappeared from My Listings and every advert dialled a dead number.
--
-- AppContext.finishPhoneChange does this automatically now. This file is
-- only for accounts that changed their number BEFORE that shipped.
--
-- Everything below is scoped by owner_id — the auth uid, which is stable and
-- is what RLS actually enforces on. The phone is never used to decide which
-- rows to touch, because the whole problem is that the phone is stale.

-- 1. Find the account. Put the number it uses NOW between the quotes.
--    (If nothing comes back, the profile row itself never moved — check the
--    number, including the +218 prefix.)
select auth_uid, phone, name
from profiles
where phone = '+218XXXXXXXXX';

-- 2. Look before you write: this is what still points at an old number.
--    Run it with the auth_uid from step 1.
with account as (
  select auth_uid as uid, phone as current_phone
  from profiles
  where phone = '+218XXXXXXXXX'
)
select 'listings' as table_name,
       count(*) filter (where l.agent_id is distinct from a.current_phone) as stale_agent_id,
       count(*) filter (where l.agent_phone is distinct from a.current_phone) as stale_agent_phone
from account a
left join listings l on l.owner_id = a.uid
union all
select 'favorites',
       count(*) filter (where f.user_id is distinct from a.current_phone),
       null
from account a
left join favorites f on f.owner_id = a.uid
union all
select 'agents',
       count(*) filter (where g.phone is distinct from a.current_phone),
       null
from account a
left join agents g on g.owner_id = a.uid;

-- 3. The repair. Same number again in all three.
--
-- Deliberately three separate statements rather than one transaction block:
-- they're independent, and if the agents one trips over its primary key
-- (an old directory entry already sitting on the new number) the listings
-- repair — the one that actually matters — should still have landed.

update listings
set agent_id = p.phone,
    agent_phone = p.phone
from profiles p
where p.phone = '+218XXXXXXXXX'
  and listings.owner_id = p.auth_uid
  and (listings.agent_id is distinct from p.phone
       or listings.agent_phone is distinct from p.phone);

update favorites
set user_id = p.phone
from profiles p
where p.phone = '+218XXXXXXXXX'
  and favorites.owner_id = p.auth_uid
  and favorites.user_id is distinct from p.phone;

update agents
set phone = p.phone
from profiles p
where p.phone = '+218XXXXXXXXX'
  and agents.owner_id = p.auth_uid
  and agents.phone is distinct from p.phone;

-- 4. Re-run step 2. Every count should now be 0.
