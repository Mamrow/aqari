// Aqari — receives Dpay's signed payment.* webhook events. This is the
// authoritative confirmation path: it's the ONLY way Moamalat payments ever
// get confirmed (that gateway has no OTP/verify step, just a redirect +
// this webhook), and it's an idempotent backstop for EDFali/Sadad in case
// verify-boost-payment's own response never reached the app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Constant-time-ish comparison — avoids a signature check that returns
// faster for early mismatches, which would leak information via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  // Signature is computed over the RAW body — must read as text before any
  // JSON parsing, or re-serialization could change byte-for-byte content
  // and silently break verification.
  const rawBody = await req.text();
  const timestamp = req.headers.get('X-DPAY-Timestamp');
  const signature = req.headers.get('X-DPAY-Signature');

  if (!timestamp || !signature) {
    return new Response(JSON.stringify({ error: 'Missing signature headers' }), { status: 401 });
  }

  const timestampSeconds = Number(timestamp);
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (!Number.isFinite(timestampSeconds) || ageSeconds > MAX_TIMESTAMP_AGE_SECONDS) {
    return new Response(JSON.stringify({ error: 'Stale or invalid timestamp' }), { status: 401 });
  }

  const secret = Deno.env.get('DPAY_WEBHOOK_SECRET') ?? '';
  const expectedSignature = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!timingSafeEqual(expectedSignature, signature)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const sessionId = payload.session_id;

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: session } = await adminClient
    .from('boost_payment_sessions')
    .select('*')
    .eq('dpay_session_id', sessionId)
    .single();

  // Unrecognized session (webhook.test, or traffic from outside this flow)
  // or already finalized (verify-boost-payment got there first) — 200 so
  // Dpay doesn't retry, no DB change either way.
  if (!session || session.status !== 'pending') {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  if (payload.event === 'payment.paid') {
    const featuredUntil = new Date(
      Date.now() + session.duration_days * 24 * 60 * 60 * 1000
    ).toISOString();
    await adminClient
      .from('listings')
      .update({ is_featured: true, featured_until: featuredUntil })
      .eq('id', session.listing_id);
    await adminClient
      .from('boost_payment_sessions')
      .update({ status: 'paid', completed_at: new Date().toISOString() })
      .eq('dpay_session_id', sessionId);
  } else if (payload.event === 'payment.failed' || payload.event === 'payment.voided') {
    await adminClient
      .from('boost_payment_sessions')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('dpay_session_id', sessionId);
  } else if (payload.event === 'payment.expired') {
    await adminClient
      .from('boost_payment_sessions')
      .update({ status: 'expired', completed_at: new Date().toISOString() })
      .eq('dpay_session_id', sessionId);
  }
  // payment.refunded / webhook.test / anything else: acknowledged, no change.

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
