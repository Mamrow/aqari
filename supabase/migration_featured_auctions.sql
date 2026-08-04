-- Aqari — Featured listings + Auctions ("Mazad").
-- Run this once against the existing live project (SQL Editor → New query →
-- paste → Run). schema.sql has already been updated to match, for anyone
-- provisioning a fresh project from scratch. Safe to re-run.

alter table listings add column if not exists is_featured boolean not null default false;

-- A seller's request to go Featured or start an Auction — admin reviews
-- these in a new screen, contacts the seller externally to agree a
-- commission percentage, then approves/rejects via the RPCs below.
create table if not exists listing_boost_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('featured', 'auction')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reserve_price numeric,
  requested_ends_at timestamptz,
  commission_percent numeric,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table listing_boost_requests enable row level security;

create policy "owner or admin can read boost requests" on listing_boost_requests for select
  using (owner_id = auth.uid() or private.is_admin());
-- Must actually own the listing being boosted — not just claim ownership
-- via the owner_id column, which by itself would be self-asserted.
create policy "owner can request boost for their own listing" on listing_boost_requests for insert
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
    and exists (select 1 from listings where id = listing_id and owner_id = auth.uid())
  );
-- No update/delete policy for regular users — approve/reject only ever
-- happens through the admin RPCs below, which bypass RLS (security definer)
-- after checking private.is_admin() themselves.

-- An active or completed auction for a listing (1:1). Public metadata only
-- — reserve price, schedule, ended status, and the final price once it's
-- over. Never anything bid- or bidder-specific; that's auction_bids below.
create table if not exists auctions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references listings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reserve_price numeric not null,
  ends_at timestamptz,
  ended boolean not null default false,
  ended_at timestamptz,
  final_price numeric,
  commission_percent numeric,
  created_at timestamptz not null default now()
);

alter table auctions enable row level security;

create policy "anyone can read auctions" on auctions for select using (true);
-- No insert/update policy for regular users — auctions are only ever
-- created by approve_boost_request and ended by end_auction_now /
-- finalize_auction_if_expired, all security definer (bypass RLS, but check
-- authorization themselves). Admin can still manage rows directly via the
-- SQL Editor / Table Editor (service role bypasses RLS regardless).

-- Individual bids — deliberately NOT readable by the general public at all.
-- This (not just hiding it in the UI) is what actually enforces blind
-- bidding: everyone gets the current highest amount only, via the
-- get_current_highest_bid RPC below, never raw rows or bidder identity.
create table if not exists auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references auctions(id) on delete cascade,
  bidder_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  created_at timestamptz not null default now()
);

alter table auction_bids enable row level security;

create policy "auction owner or admin can read bids" on auction_bids for select
  using (
    exists (select 1 from auctions where id = auction_id and owner_id = auth.uid())
    or private.is_admin()
  );
-- No insert policy at all — bids only ever go through place_bid below,
-- which validates against the current highest bid (a cross-row check that's
-- awkward to express safely in a WITH CHECK clause) and bypasses RLS as a
-- security definer function.

-- Public: what any bidder needs to know to place a valid bid, without ever
-- exposing individual rows or who placed them.
create or replace function public.get_current_highest_bid(p_auction_id uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select max(amount) from auction_bids where auction_id = p_auction_id),
    (select reserve_price from auctions where id = p_auction_id)
  );
$$;

grant execute on function public.get_current_highest_bid(uuid) to anon, authenticated;

-- Places a bid: must be signed in, can't bid on your own listing, auction
-- must still be open, and the amount must actually beat the current
-- highest (or meet the reserve, for the first bid).
create or replace function public.place_bid(p_auction_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction auctions%rowtype;
  v_bid_count int;
  v_current_highest numeric;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to bid';
  end if;

  select * into v_auction from auctions where id = p_auction_id;
  if not found then
    raise exception 'Auction not found';
  end if;
  if v_auction.ended then
    raise exception 'Auction has ended';
  end if;
  if v_auction.owner_id = auth.uid() then
    raise exception 'Cannot bid on your own listing';
  end if;

  select count(*), max(amount) into v_bid_count, v_current_highest
  from auction_bids where auction_id = p_auction_id;

  if v_bid_count = 0 then
    if p_amount < v_auction.reserve_price then
      raise exception 'Bid must meet the reserve price';
    end if;
  else
    if p_amount <= v_current_highest then
      raise exception 'Bid must exceed the current highest bid';
    end if;
  end if;

  insert into auction_bids (auction_id, bidder_id, amount) values (p_auction_id, auth.uid(), p_amount);
end;
$$;

grant execute on function public.place_bid(uuid, numeric) to authenticated;

-- Ends an auction early — callable by the owner or admin only.
create or replace function public.end_auction_now(p_auction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction auctions%rowtype;
  v_final numeric;
begin
  select * into v_auction from auctions where id = p_auction_id;
  if not found then
    raise exception 'Auction not found';
  end if;
  if v_auction.ended then
    return;
  end if;
  if not (auth.uid() = v_auction.owner_id or private.is_admin()) then
    raise exception 'Not authorized to end this auction';
  end if;

  select max(amount) into v_final from auction_bids where auction_id = p_auction_id;

  update auctions set ended = true, ended_at = now(), final_price = v_final where id = p_auction_id;
end;
$$;

grant execute on function public.end_auction_now(uuid) to authenticated;

-- Lazily closes an auction whose scheduled end has passed — called
-- client-side whenever an auction is viewed, rather than via a cron job
-- (no scheduled-task infra exists in this project yet). A no-op if not yet
-- expired or already ended, so it's safe to call on every view.
create or replace function public.finalize_auction_if_expired(p_auction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction auctions%rowtype;
  v_final numeric;
begin
  select * into v_auction from auctions where id = p_auction_id;
  if not found or v_auction.ended then
    return;
  end if;
  if v_auction.ends_at is null or v_auction.ends_at > now() then
    return;
  end if;

  select max(amount) into v_final from auction_bids where auction_id = p_auction_id;

  update auctions set ended = true, ended_at = now(), final_price = v_final where id = p_auction_id;
end;
$$;

grant execute on function public.finalize_auction_if_expired(uuid) to anon, authenticated;

-- Full bid history with bidder name/phone — owner or admin only. Bypasses
-- profiles' own "own row only" RLS (bidders aren't necessarily in the
-- agents/sellers directory, so there's no other way to resolve their
-- contact info) after checking the caller is actually authorized.
create or replace function public.get_auction_bids_detailed(p_auction_id uuid)
returns table (
  bid_id uuid,
  bidder_name text,
  bidder_phone text,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from auctions where id = p_auction_id;
  if v_owner_id is null then
    raise exception 'Auction not found';
  end if;
  if not (auth.uid() = v_owner_id or private.is_admin()) then
    raise exception 'Not authorized';
  end if;

  return query
    select b.id, p.name, p.phone, b.amount, b.created_at
    from auction_bids b
    left join profiles p on p.auth_uid = b.bidder_id
    where b.auction_id = p_auction_id
    order by b.amount desc;
end;
$$;

grant execute on function public.get_auction_bids_detailed(uuid) to authenticated;

-- Approves a pending request: flips is_featured for 'featured' requests,
-- or creates the auctions row for 'auction' requests (using the reserve
-- price / optional scheduled end the seller specified when requesting).
-- Records the agreed commission percentage for admin's own reference.
create or replace function public.approve_boost_request(p_request_id uuid, p_commission_percent numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request listing_boost_requests%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_request from listing_boost_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Request already decided';
  end if;

  if v_request.request_type = 'featured' then
    update listings set is_featured = true where id = v_request.listing_id;
  elsif v_request.request_type = 'auction' then
    insert into auctions (listing_id, owner_id, reserve_price, ends_at, commission_percent)
    values (v_request.listing_id, v_request.owner_id, v_request.reserve_price, v_request.requested_ends_at, p_commission_percent);
  end if;

  update listing_boost_requests
  set status = 'approved', decided_at = now(), commission_percent = p_commission_percent
  where id = p_request_id;
end;
$$;

grant execute on function public.approve_boost_request(uuid, numeric) to authenticated;

create or replace function public.reject_boost_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'Not authorized';
  end if;
  update listing_boost_requests set status = 'rejected', decided_at = now()
  where id = p_request_id and status = 'pending';
end;
$$;

grant execute on function public.reject_boost_request(uuid) to authenticated;
