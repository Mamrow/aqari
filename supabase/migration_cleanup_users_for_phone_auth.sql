-- Aqari — one-time cleanup ahead of switching sign-up/sign-in to native
-- Supabase phone-OTP auth (see migration to follow, and AuthModal.js/
-- AppContext.js). Existing accounts only have a synthetic-email identity
-- (see src/utils/phoneAuth.js, now removed) with no `phone` identity
-- attached — rather than building/maintaining a legacy dual-identity
-- bridge, every account except the admin allowlist is deleted so the app
-- can cut over cleanly. profiles/favorites/agents rows for deleted users
-- cascade automatically (see schema.sql's `on delete cascade`); their
-- listings survive with owner_id set to null (`on delete set null`), same
-- as today's regular account-deletion behavior.
--
-- DESTRUCTIVE AND IRREVERSIBLE. Run the SELECT below FIRST, on its own, and
-- read the output — confirm it's only the accounts you expect to lose —
-- before uncommenting and running the DELETE beneath it. Do not run both
-- statements blindly in one go.

select u.id, u.email, u.phone, p.phone as profile_phone, p.name
from auth.users u
left join profiles p on p.auth_uid = u.id
where u.id not in (select uid from private.admins);

-- delete from auth.users
-- where id not in (select uid from private.admins);
