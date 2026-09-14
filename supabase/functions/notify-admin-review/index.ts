// Aqari — tells the admins a listing is waiting for review.
//
// Fired by the database trigger in migration_admin_review_notifications.sql,
// on the two ways a listing lands in the queue: a new listing is inserted as
// 'pending', or a rejected one is resubmitted and goes back to 'pending'.
// Without this the only way to know there was something to approve was to
// open the Approvals tab and look.
//
// Two channels, independent of each other:
// - Push, to every admin with a push token. Always on.
// - Email, only when RESEND_API_KEY and ADMIN_NOTIFY_EMAIL are both set. An
//   admin who isn't looking at their phone still hears about it, and a
//   project that never configures email loses nothing.
//
// Neither message carries the seller's name or phone number. The admin is
// about to open the listing in the app anyway, and an email is a copy that
// lives on in someone else's mail server — so it gets what the review is
// about, not who asked for it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_FROM_DEFAULT = 'Aqari <onboarding@resend.dev>';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
  );

Deno.serve(async (req) => {
  // Same shared secret the other two notification functions check — see
  // notify-listing-status for why it isn't the service role key.
  const expectedSecret = Deno.env.get('DB_WEBHOOK_SECRET');
  if (!expectedSecret || req.headers.get('X-Webhook-Secret') !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const payload = await req.json();
  const record = payload.record;
  const oldRecord = payload.old_record;

  // Entering the queue, not being edited while already in it: a seller
  // fixing a typo on a pending listing must not page the admins again.
  const enteredQueue =
    record?.status === 'pending' &&
    (payload.type === 'INSERT' || oldRecord?.status !== 'pending');
  if (!enteredQueue) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }
  const resubmitted = payload.type === 'UPDATE';

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const title = resubmitted ? 'إعلان أُعيد إرساله · Listing resubmitted' : 'إعلان بانتظار المراجعة · Listing to review';
  const price = typeof record.price === 'number' ? `${record.price.toLocaleString('en-US')} LYD` : '';
  const body = [record.title, record.city, price].filter(Boolean).join(' · ');

  const result: Record<string, unknown> = {};

  // ── Push ────────────────────────────────────────────────────────────────
  // private.admins isn't exposed over the API, so this goes through an RPC
  // that only the service role may execute.
  const { data: tokens, error: tokenError } = await adminClient.rpc('admin_push_tokens');
  if (tokenError) {
    console.error('notify-admin-review: could not load admin tokens', tokenError);
    result.push = 'error';
  } else if (!tokens?.length) {
    result.push = 'no admin push tokens';
  } else {
    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        (tokens as { push_token: string }[]).map(({ push_token }) => ({
          to: push_token,
          title,
          body,
          data: { listingId: record.id, status: 'pending' },
        }))
      ),
    });
    if (!expoRes.ok) console.error('notify-admin-review: Expo push failed', await expoRes.text());
    result.push = expoRes.ok ? tokens.length : 'error';
  }

  // ── Email (optional) ────────────────────────────────────────────────────
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail = Deno.env.get('ADMIN_NOTIFY_EMAIL');
  if (resendKey && adminEmail) {
    const rows = [
      ['Title', record.title],
      ['Purpose', record.listing_type],
      ['Type', record.property_type],
      ['City', [record.city, record.district].filter(Boolean).join(' / ')],
      ['Price', price],
    ].filter(([, value]) => value);

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('ADMIN_NOTIFY_FROM') ?? RESEND_FROM_DEFAULT,
        to: adminEmail.split(',').map((address) => address.trim()),
        subject: `${resubmitted ? 'Resubmitted' : 'New'} listing to review: ${record.title}`,
        // Listing text is user-written, so it's escaped before it goes into
        // markup — an email client is a renderer like any other.
        html:
          `<p>${resubmitted ? 'A rejected listing was resubmitted' : 'A new listing is waiting for review'} in Aqari.</p>` +
          `<table>${rows
            .map(([label, value]) => `<tr><td><b>${label}</b></td><td>${escapeHtml(String(value))}</td></tr>`)
            .join('')}</table>` +
          '<p>Open the Approvals tab in the app to review it.</p>',
      }),
    });
    if (!emailRes.ok) console.error('notify-admin-review: Resend failed', emailRes.status, await emailRes.text());
    result.email = emailRes.ok ? 'sent' : 'error';
  } else {
    result.email = 'not configured';
  }

  return new Response(JSON.stringify(result), { status: 200 });
});
