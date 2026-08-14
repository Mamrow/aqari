// Aqari — sends a push notification to a listing's owner when admin
// approves or rejects it. Triggered by a Supabase Database Webhook on
// listings UPDATE (dashboard-configured — see the setup note at the bottom
// of this file; there's no way to create a Database Webhook from a SQL
// migration, same class of manual step as the anonymous-sign-ins toggle
// documented elsewhere in this project).
//
// Deliberately NOT wired via pg_net + a hardcoded key inside
// admin_set_listing_status: that would mean embedding a real service-role
// (or even anon) credential inside schema.sql, which is checked into git —
// a Database Webhook lets Supabase handle that authentication itself, and
// the shared secret this function checks for is a separate, narrowly-scoped
// value, not the actual service role key.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // Database Webhooks can be configured with a custom header — this is a
  // shared secret ONLY this function and the webhook config know, not the
  // service role key itself. Set DB_WEBHOOK_SECRET as an Edge Function
  // secret, and configure the webhook (Database → Webhooks in the
  // dashboard) to send the same value as an "X-Webhook-Secret" header.
  const expectedSecret = Deno.env.get('DB_WEBHOOK_SECRET');
  const providedSecret = req.headers.get('X-Webhook-Secret');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const payload = await req.json();
  const record = payload.record;
  const oldRecord = payload.old_record;

  // Only fire on a genuine transition into approved/rejected — not every
  // update to the row (editing title/price shouldn't re-notify).
  const isStatusChange = record?.status !== oldRecord?.status;
  const isRelevantStatus = record?.status === 'approved' || record?.status === 'rejected';
  if (!isStatusChange || !isRelevantStatus || !record?.owner_id) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: profile } = await adminClient
    .from('profiles')
    .select('push_token')
    .eq('auth_uid', record.owner_id)
    .maybeSingle();

  // No token on file — account never granted notification permission (or
  // hasn't opened the app since this feature shipped). Nothing to send,
  // not an error.
  if (!profile?.push_token) {
    return new Response(JSON.stringify({ skipped: true, reason: 'no push token' }), { status: 200 });
  }

  const isApproved = record.status === 'approved';
  const title = isApproved ? 'Listing approved' : 'Listing rejected';
  const body = isApproved
    ? `"${record.title}" is now live for buyers to see.`
    : `"${record.title}" was rejected. Check the app for details.`;

  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: profile.push_token,
      title,
      body,
      data: { listingId: record.id, status: record.status },
    }),
  });

  if (!expoRes.ok) {
    const errText = await expoRes.text();
    console.error('Expo push send failed', errText);
    return new Response(JSON.stringify({ error: 'Push send failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ sent: true }), { status: 200 });
});

// --- One-time manual setup (dashboard, not SQL) ---
// 1. Set a DB_WEBHOOK_SECRET Edge Function secret (any random string):
//    supabase secrets set DB_WEBHOOK_SECRET=<random-value>
// 2. Dashboard → Database → Webhooks → Create a new webhook:
//    - Table: listings, Event: Update
//    - Type: HTTP Request → this function's URL
//    - HTTP Headers: X-Webhook-Secret = <the same random value>
