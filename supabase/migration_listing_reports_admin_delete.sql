-- Aqari — lets admin delete a report out of the queue entirely (not just
-- mark reviewed/dismissed). migration_listing_reports.sql only granted
-- select/update to private.is_admin(); RLS with no delete policy denies
-- delete outright, including for admin, so it needs its own policy. Run once
-- in the SQL Editor.

create policy "admin can delete listing reports" on listing_reports for delete
  using (private.is_admin());
