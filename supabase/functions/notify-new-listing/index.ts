// Aqari — alerts people about a new listing in a city they follow.
//
// Triggered by a Supabase Database Webhook on listings UPDATE, the same way
// notify-listing-status is (see the setup note at the bottom). A listing
// becomes visible to buyers when an admin flips status to 'approved', not
// when the row is inserted, so approval is the moment worth notifying on —
// an INSERT webhook would announce listings still sitting in moderation.
//
// This is the one place in the app that reads other accounts' rows. RLS
// forbids that to every client, correctly, so the send runs here under the
// service role and nowhere else: no client-side path can enumerate push
// tokens.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Expo's push API caps a request at 100 messages. Chunking rather than
// assuming the audience is small — this is the query that grows with the
// user base.
const EXPO_PUSH_CHUNK = 100;

Deno.serve(async (req) => {
  // Shared secret known only to this function and the webhook config — not
  // the service role key. See notify-listing-status for the reasoning.
  const expectedSecret = Deno.env.get('DB_WEBHOOK_SECRET');
  const providedSecret = req.headers.get('X-Webhook-Secret');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const payload = await req.json();
  const record = payload.record;
  const oldRecord = payload.old_record;

  // Only on the transition into approved. Editing an already-approved
  // listing's price must not re-announce it to everyone who follows the
  // city — that's the difference between an alert and spam.
  const justApproved = record?.status === 'approved' && oldRecord?.status !== 'approved';
  if (!justApproved || !record?.city) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Opted in, has a token, and either follows this city or follows none
  // (which means "anywhere"). The city filter is applied in JS rather than
  // as an `.overlaps()` because the empty-array case means the opposite of
  // what an overlap test would return for it.
  const { data: recipients, error } = await adminClient
    .from('profiles')
    .select('auth_uid, push_token, notify_cities, notify_districts')
    .eq('notify_new_listings', true)
    .not('push_token', 'is', null);

  if (error) {
    console.error('Failed to load recipients', error);
    return new Response(JSON.stringify({ error: 'Query failed' }), { status: 500 });
  }

  // Districts are stored as "city:district" so this function needs no
  // district→city map of its own: everything below is decided from the
  // listing's own city and district.
  const matchesArea = (profile: { notify_cities?: string[]; notify_districts?: string[] }) => {
    const cities = profile.notify_cities ?? [];
    // No cities picked means everywhere, which is the default this feature
    // shipped with.
    if (cities.length > 0 && !cities.includes(record.city)) return false;

    const narrowed = (profile.notify_districts ?? []).filter((key) =>
      key.startsWith(`${record.city}:`)
    );
    // They follow this city but named no districts in it — the whole city.
    if (narrowed.length === 0) return true;
    // They did name districts, so the listing has to be in one of them. A
    // listing with no district at all can't match a district filter, and
    // shouldn't fall through to "send anyway".
    return record.district ? narrowed.includes(`${record.city}:${record.district}`) : false;
  };

  const tokens = (recipients ?? [])
    // Never tell someone about their own listing being approved — they
    // already got the approval push from notify-listing-status.
    .filter((profile) => profile.auth_uid !== record.owner_id)
    .filter(matchesArea)
    .map((profile) => profile.push_token);

  if (tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no recipients' }), { status: 200 });
  }

  // Both languages in one message: the notification is delivered by Expo's
  // servers, which know nothing about the recipient's in-app language
  // setting, and reading the recipient's language per row would mean a
  // message per person rather than a batch.
  const title = 'عقار جديد · New listing';
  const price = typeof record.price === 'number' ? record.price.toLocaleString('en-US') : '';
  const body = price ? `${record.title} — ${price} LYD` : record.title;

  let sent = 0;
  for (let index = 0; index < tokens.length; index += EXPO_PUSH_CHUNK) {
    const chunk = tokens.slice(index, index + EXPO_PUSH_CHUNK);
    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        chunk.map((token) => ({
          to: token,
          title,
          body,
          data: { listingId: record.id, city: record.city },
        }))
      ),
    });

    if (!expoRes.ok) {
      // A failed chunk shouldn't abandon the rest: a single dead token in
      // one batch is normal and shouldn't cost everyone else their alert.
      console.error('Expo push chunk failed', await expoRes.text());
      continue;
    }
    sent += chunk.length;
  }

  return new Response(JSON.stringify({ sent }), { status: 200 });
});

// --- One-time manual setup (dashboard, not SQL) ---
// Database Webhooks can't be created from a migration, same as
// notify-listing-status.
//
// 1. Run supabase/migration_new_listing_alerts.sql.
// 2. Deploy: supabase functions deploy notify-new-listing
// 3. Reuse the existing DB_WEBHOOK_SECRET (both functions check the same
//    one) or set it if it isn't set yet:
//      supabase secrets set DB_WEBHOOK_SECRET=<random-value>
// 4. Dashboard → Database → Webhooks → Create a new webhook:
//    - Table: listings, Event: Update
//    - Type: HTTP Request → this function's URL
//    - HTTP Headers: X-Webhook-Secret = <the same value>
//
// That's a second webhook on the same table/event as notify-listing-status,
// which is fine — Supabase fires both, and each ignores the transitions it
// doesn't care about.
