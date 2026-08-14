-- Aqari — "Verified agent" trust badge. Run once in the SQL Editor.
--
-- Same column-lockdown pattern already used for listings
-- (migration_fix_listings_column_lockdown.sql) — necessary here for the
-- exact same reason self-featuring/self-approving was a real bug: the
-- existing "own account can update its agent entry" / "own account can
-- register as agent" RLS policies are row-level only (owner_id = auth.uid()),
-- so without a column-level restriction too, any signed-in agent could set
-- verified=true on themselves via a raw REST insert/update, bypassing admin
-- entirely.

alter table agents add column if not exists verified boolean not null default false;

revoke insert, update on agents from authenticated;

-- Only phone/name/owner_id are legitimate for an agent to set themselves
-- (submitListing's upsert / self-registration) — verified is deliberately
-- excluded from both grants below, leaving it settable only via the
-- security-definer RPC further down.
grant insert (phone, name, owner_id) on agents to authenticated;
grant update (name) on agents to authenticated;

create or replace function public.admin_set_agent_verified(p_phone text, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only';
  end if;

  update agents set verified = p_verified where phone = p_phone;

  if not found then
    raise exception 'Agent not found';
  end if;
end;
$$;

grant execute on function public.admin_set_agent_verified(text, boolean) to authenticated;
