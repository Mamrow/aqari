-- Aqari — closes a real gap flagged by Supabase's Security Advisor.
-- get_reset_email_for_phone's own comment in schema.sql claimed it was
-- "deliberately NOT granted to anon/authenticated," but no revoke ever
-- actually ran — Postgres grants EXECUTE on new functions to PUBLIC by
-- default, so anyone holding the public anon key could call this directly
-- via /rest/v1/rpc/get_reset_email_for_phone and harvest real email
-- addresses by phone number (rate-limited, but not otherwise gated at all).
-- Only the send-password-reset Edge Function (service role, bypasses
-- grants) has any legitimate reason to call this.
revoke execute on function public.get_reset_email_for_phone(text) from anon, authenticated;

-- Also from the same Security Advisor pass: listing-photos is a public
-- bucket, so object URLs already resolve for anyone regardless of RLS
-- (public buckets serve via /storage/v1/object/public/... unconditionally).
-- This SELECT policy on storage.objects isn't protecting image display at
-- all — it only additionally lets anyone enumerate every file in the bucket
-- via list()/getPublicUrl-style queries, including orphaned files from
-- deleted listings (deleting a listing doesn't cascade-delete its storage
-- objects). Safe to drop: the app only ever loads images by known URL, it
-- never calls .list() on this bucket.
drop policy "public read listing photos" on storage.objects;
