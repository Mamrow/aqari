-- favorites.owner_id (the real auth uid) was already the enforced identity
-- for row ownership, but user_id (the phone, used to query "my favorites"
-- in AppContext.js's fetchFavorites) was never validated against the
-- caller's own profile — a crafted insert with owner_id = auth.uid() (valid)
-- but user_id = someone else's phone would plant a favorite under a phone
-- number that isn't the caller's own. Low severity (no financial or
-- moderation impact, just a data-hygiene/griefing vector: another user's
-- saved-listings list gets an unwanted entry), but cheap to close properly.
alter policy "own account manages favorites" on favorites
  with check (
    owner_id = auth.uid()
    and user_id = (select phone from profiles where auth_uid = auth.uid())
  );
