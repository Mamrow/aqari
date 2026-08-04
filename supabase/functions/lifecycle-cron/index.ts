// Aqari — daily listing lifecycle sweep, called by pg_cron (see
// migration_lifecycle_cron_schedule.sql). Same service-role client
// construction as send-password-reset/index.ts. Not meant to be called by
// the app itself — there's no anon/authenticated grant for it, only the
// cron job's service-role key gets past the CRON_SECRET check below.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: deleteError, count: deletedCount } = await adminClient
    .from('listings')
    .delete({ count: 'exact' })
    .eq('listing_state', 'expired')
    .lt('expires_at', fourteenDaysAgo);

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
      unfeatured: unfeaturedCount ?? 0,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
