-- Lets admin accounts see every seller's Featured payment history (not just
-- their own), for the admin-facing Payment History screen — combined with
-- the existing owner policy as a second permissive rule, so sellers keep
-- reading their own rows exactly as before.
create policy "admin can read all boost payment sessions" on boost_payment_sessions for select
  using (private.is_admin());
