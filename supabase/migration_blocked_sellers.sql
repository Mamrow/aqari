-- Aqari — "Block seller" feature (Apple App Store Guideline 1.2 UGC safety:
-- report + block on user-generated content). Run once in the SQL Editor.
-- Same conventions as favorites: keyed on the real account (owner_id/auth.uid()),
-- not the human-facing phone number, and each account manages only its own rows.

create table if not exists blocked_sellers (
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The blocked seller's contact phone (agents.phone / listings.agent_id) —
  -- not a foreign key to agents, since a phone can be blocked even if that
  -- seller's directory entry is later removed.
  blocked_phone text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, blocked_phone)
);

alter table blocked_sellers enable row level security;

create policy "own account manages blocked sellers" on blocked_sellers for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
