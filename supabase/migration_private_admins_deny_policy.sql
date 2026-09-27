-- Aqari — make private.admins' "nobody reads this directly" explicit.
--
-- Supabase's linter flags the table (rls_enabled_no_policy) because RLS is on
-- and no policy exists. That was already deny-all — no policy means no rows
-- for anyone RLS applies to — and the table lives in `private`, which isn't
-- exposed over the API. This policy says the same thing out loud so the
-- warning stops recurring. Behavior is unchanged.
--
-- It can't lock admins out: private.is_admin() (and am_i_admin() on top of it)
-- is SECURITY DEFINER owned by postgres, the table's owner, and the table
-- isn't FORCE ROW LEVEL SECURITY, so the function bypasses RLS entirely.
-- Checked on the live database, September 2026.

drop policy if exists "no direct access" on private.admins;
create policy "no direct access" on private.admins
  for all
  using (false)
  with check (false);
