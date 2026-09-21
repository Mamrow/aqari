// Convert between this app's camelCase shape and Supabase/Postgres's snake_case columns.

/**
 * The columns a signed-out visitor is allowed to read, named explicitly.
 *
 * agent_phone and agent_id are missing on purpose — both hold a seller's
 * phone number, and `anon` has no SELECT privilege on either
 * (supabase/migration_hide_seller_phone_from_anon.sql). Postgres refuses the
 * whole query rather than dropping a forbidden column, so `select('*')` would
 * fail outright for anyone not signed in; this list is what replaces it.
 *
 * Keep it in step with the GRANT in that migration. A column granted there
 * but missing here is merely unused; one named here but not granted breaks
 * anonymous browsing entirely.
 */
export const LISTING_PUBLIC_COLUMNS = [
  'id',
  'title',
  'price',
  'area',
  'description',
  'listing_type',
  'property_type',
  'rooms',
  'images',
  'amenities',
  'audience_target',
  'city',
  'district',
  'latitude',
  'longitude',
  'status',
  'owner_id',
  'created_at',
  'is_featured',
  'listing_state',
  'expires_at',
  'renewed_at',
  'featured_until',
  'has_contact',
].join(', ');

export function listingFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    price: Number(row.price),
    area: Number(row.area),
    description: row.description,
    agentPhone: row.agent_phone,
    listingType: row.listing_type,
    propertyType: row.property_type,
    rooms: row.rooms,
    images: row.images ?? [],
    amenities: row.amenities ?? [],
    audienceTarget: row.audience_target,
    city: row.city,
    district: row.district,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    agentId: row.agent_id,
    // The seller's account (owner_id), for their profile page. Named sellerId,
    // not ownerId, on purpose: listingToRow reads `ownerId` and would then
    // send owner_id on every edit — a column the owner has no UPDATE grant
    // on, so saving an edited listing would be denied.
    sellerId: row.owner_id,
    // Is there a number to call at all? A listing whose seller deleted their
    // account has none (delete-account blanks it), and a signed-out visitor
    // can't see agent_phone to work that out for themselves — hence the
    // generated column. The fallback keeps a client running against a
    // database without that column working: a signed-in read still has the
    // real phone to look at.
    hasContact: row.has_contact ?? Boolean(row.agent_phone),
    isFeatured: row.is_featured ?? false,
    listingState: row.listing_state,
    expiresAt: row.expires_at,
    renewedAt: row.renewed_at,
    featuredUntil: row.featured_until,
  };
}

export function listingToRow(listing) {
  return {
    title: listing.title,
    price: listing.price,
    area: listing.area,
    description: listing.description,
    agent_phone: listing.agentPhone,
    listing_type: listing.listingType,
    property_type: listing.propertyType,
    rooms: listing.rooms,
    images: listing.images,
    amenities: listing.amenities,
    audience_target: listing.audienceTarget,
    city: listing.city,
    district: listing.district,
    latitude: listing.latitude,
    longitude: listing.longitude,
    // Neither caller ever sets this anymore — INSERT/UPDATE privilege on the
    // column is revoked for authenticated (migration_fix_listings_column_
    // lockdown.sql); status only ever changes via admin_set_listing_status
    // or resubmit_rejected_listing now. Kept here (always undefined, always
    // dropped from the request body) only so a stray `status` on the input
    // object can't silently leak into the row.
    status: listing.status,
    agent_id: listing.agentId,
    // Only present on insert (submitListing) — undefined on update, which is
    // dropped from the request body entirely, leaving the existing row's
    // owner_id (the real RLS-enforced identity) untouched.
    owner_id: listing.ownerId,
  };
}

export function agentFromRow(row) {
  return {
    phone: row.phone,
    name: row.name,
    verified: row.verified ?? false,
  };
}

export function profileFromRow(row) {
  return {
    phone: row.phone,
    name: row.name,
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
    // Optional contact email the account typed in — not an auth identity.
    email: row.email ?? null,
    // New-listing alerts. Defaulted here rather than assumed present, so a
    // client running against a database that hasn't had
    // migration_new_listing_alerts.sql applied yet reads as "opted out"
    // instead of undefined.
    notifyNewListings: row.notify_new_listings ?? false,
    notifyCities: row.notify_cities ?? [],
    // "city:district" keys — see migration_new_listing_alert_districts.sql
    // for why they're composite.
    notifyDistricts: row.notify_districts ?? [],
  };
}

// boost_payment_sessions has no direct FK to profiles (only to auth.users,
// which isn't queryable from the client) — the embedded `listings` row is
// how both the seller and admin payment-history views get a name/contact to
// show, same as the existing admin listing screens which show agent_phone
// straight off the listing rather than joining through a profile.
// Same "embed the listing for context" pattern as boostPaymentFromRow —
// admin's report list needs a title/contact to show without a second query
// per row.
export function listingReportFromRow(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listings?.title ?? null,
    listingAgentPhone: row.listings?.agent_phone ?? null,
    reason: row.reason,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function boostPaymentFromRow(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listings?.title ?? null,
    listingType: row.listings?.listing_type ?? null,
    agentPhone: row.listings?.agent_phone ?? null,
    ownerId: row.owner_id,
    payMethod: row.pay_method,
    durationDays: row.duration_days,
    amount: Number(row.amount),
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}
