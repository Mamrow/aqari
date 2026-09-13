-- Aqari — backfill the Registered Sellers directory, and let a phone change
-- carry the directory entry with it.
--
-- Why it's empty: submitListing registers the seller with a merging upsert,
-- whose ON CONFLICT DO UPDATE names every column in the payload — phone and
-- owner_id among them. 'authenticated' is granted UPDATE on `name` alone
-- (migration_agent_verified.sql, which exists to stop a seller writing their
-- own `verified` flag). Postgres checks those column privileges when it
-- plans the statement rather than when a conflict actually occurs, so the
-- statement was denied outright and no row was ever written — not even the
-- first, non-conflicting one. It failed into a console.warn, so nothing ever
-- surfaced it.
--
-- The client sends ON CONFLICT DO NOTHING now, which needs only the INSERT
-- grant it already has. This file fixes the rows that were lost meanwhile,
-- and adds the one grant the phone-change repoint needs.

-- ── 1. What's missing ────────────────────────────────────────────────────
-- Every account that has published a listing but has no directory entry.
-- Read-only; run it first and see whether the count matches what you expect.
select p.auth_uid, p.phone, p.name, count(l.id) as listings
from profiles p
join listings l on l.owner_id = p.auth_uid
left join agents a on a.owner_id = p.auth_uid
where a.owner_id is null
group by p.auth_uid, p.phone, p.name
order by listings desc;

-- ── 2. Backfill ──────────────────────────────────────────────────────────
-- One entry per account, keyed on owner_id — never on the phone, which is
-- exactly the value that goes stale. Uses the profile's *current* number and
-- name, so an account that has since changed its number lands in the
-- directory under the number it uses now.
--
-- verified is left at its default of false: this backfills who exists, and
-- says nothing about who has been checked.
insert into agents (phone, name, owner_id)
select distinct on (p.auth_uid) p.phone, p.name, p.auth_uid
from profiles p
join listings l on l.owner_id = p.auth_uid
left join agents a on a.owner_id = p.auth_uid
where a.owner_id is null
on conflict (phone) do nothing;

-- ── 3. Let a number change take the directory entry with it ──────────────
-- AppContext.finishPhoneChange repoints listings, favorites and this entry
-- when someone changes their number. That last one needs UPDATE on `phone`,
-- which was never granted — so without this the entry would be left behind
-- under a number the account no longer has.
--
-- `verified` stays excluded, which is the whole point of the original
-- lockdown: a seller still cannot mark themselves verified.
grant update (name, phone) on agents to authenticated;

-- ── 4. Check ─────────────────────────────────────────────────────────────
-- Step 1 should now return nothing, and this should list every seller.
select a.phone, a.name, a.verified, count(l.id) as listings
from agents a
left join listings l on l.owner_id = a.owner_id
group by a.phone, a.name, a.verified
order by listings desc;
