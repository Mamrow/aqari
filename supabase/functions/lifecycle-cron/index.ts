// Aqari — daily listing lifecycle sweep, called by pg_cron (see
// migration_lifecycle_cron_schedule.sql). Same service-role client
// construction as send-password-reset/index.ts. Not meant to be called by
// the app itself — there's no anon/authenticated grant for it, only the
// cron job's service-role key gets past the CRON_SECRET check below.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'listing-photos';

// Public URL -> object path, same parsing as delete-account/index.ts and the
// app's own src/utils/uploadImage.js.
function objectPathFromPublicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex === -1) return null;
  try {
    const path = decodeURIComponent(value.slice(markerIndex + marker.length).split('?')[0]).replace(
      /^\/+/,
      ''
    );
    return path && !path.includes('..') ? path : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // pg_net's http_post carries the service-role key as a bearer token — this
  // just confirms it's actually that key, not a guessable public endpoint.
  const authHeader = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`;
  if (authHeader !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const now = new Date().toISOString();

  const { error: expireError, count: expiredCount } = await adminClient
    .from('listings')
    .update({ listing_state: 'expired' }, { count: 'exact' })
    .eq('listing_state', 'active')
    .lt('expires_at', now);

  // Read the media off the doomed rows before deleting them: once the rows
  // are gone there is no way left to find their objects, and until now
  // nothing ever removed them — every listing this sweep purged left its
  // photos and videos sitting in a public bucket, still downloadable at
  // their original URLs. Storage is not covered by the row delete (the
  // images column is just text), so it has to happen here, under the
  // service role, which is also the only identity allowed to remove another
  // account's uploads.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: doomed } = await adminClient
    .from('listings')
    .select('images')
    .eq('listing_state', 'expired')
    .lt('expires_at', fourteenDaysAgo);

  const { error: deleteError, count: deletedCount } = await adminClient
    .from('listings')
    .delete({ count: 'exact' })
    .eq('listing_state', 'expired')
    .lt('expires_at', fourteenDaysAgo);

  // Only after the rows are actually gone, so a storage failure can never
  // strip a listing that is still live. Best-effort: a leftover object is a
  // wasted byte, not a broken sweep, and the counts below stay about rows.
  let purgedMedia = 0;
  if (!deleteError) {
    const paths = [
      ...new Set(
        (doomed ?? [])
          .flatMap((row) => (Array.isArray(row.images) ? row.images : []))
          .map(objectPathFromPublicUrl)
          .filter((path): path is string => Boolean(path))
      ),
    ];
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error: storageError } = await adminClient.storage.from(BUCKET).remove(batch);
      if (storageError) {
        console.error('lifecycle-cron: media cleanup failed', storageError);
        break;
      }
      purgedMedia += batch.length;
    }
  }

  const { error: unfeaturedError, count: unfeaturedCount } = await adminClient
    .from('listings')
    .update({ is_featured: false }, { count: 'exact' })
    .eq('is_featured', true)
    .lt('featured_until', now);

  const errors = [expireError, deleteError, unfeaturedError].filter(Boolean);
  if (errors.length > 0) {
    console.error('lifecycle-cron errors', errors);
    return new Response(JSON.stringify({ errors }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      expired: expiredCount ?? 0,
      deleted: deletedCount ?? 0,
      purgedMedia,
      unfeatured: unfeaturedCount ?? 0,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
