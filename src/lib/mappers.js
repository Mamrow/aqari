// Convert between this app's camelCase shape and Supabase/Postgres's snake_case columns.

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
  };
}

export function profileFromRow(row) {
  return {
    phone: row.phone,
    name: row.name,
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
  };
}

// boost_payment_sessions has no direct FK to profiles (only to auth.users,
// which isn't queryable from the client) — the embedded `listings` row is
// how both the seller and admin payment-history views get a name/contact to
// show, same as the existing admin listing screens which show agent_phone
// straight off the listing rather than joining through a profile.
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
