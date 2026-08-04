// Aqari — submits the OTP a seller received from their wallet (EDFali/Sadad)
// to Dpay's verify endpoint, server-to-server, using our own API token — the
// client never talks to Dpay directly. On a confirmed "paid" status this
// flips is_featured/featured_until immediately, giving instant UI feedback;
// dpay-webhook (payment.paid) does the same update as an idempotent
// backstop in case this response never reaches the app (closed mid-request,
// dropped connection, etc.) or for Moamalat, which has no verify step at all.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401 });
  }

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
  }
  const userId = userData.user.id;

  const { session_id, otp } = await req.json();
  if (!session_id || !otp) {
    return new Response(JSON.stringify({ error: 'session_id and otp are required' }), { status: 400 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: session, error: sessionError } = await adminClient
    .from('boost_payment_sessions')
    .select('*')
    .eq('dpay_session_id', session_id)
    .single();
  if (sessionError || !session || session.owner_id !== userId) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
  }
  if (session.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'Session already finalized', status: session.status }), {
      status: 400,
    });
  }

  const dpayRes = await fetch(`${Deno.env.get('DPAY_API_BASE_URL')}/payment/sessions/verify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('DPAY_API_TOKEN')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ session_id, otp }),
  });
  const dpayData = await dpayRes.json();

  if (!dpayRes.ok || dpayData.status !== 'paid') {
    return new Response(
      JSON.stringify({ error: dpayData.message ?? 'Payment not confirmed', details: dpayData }),
      { status: 400 }
    );
  }

  // Idempotent update guarded by the 'pending' check above — safe even if
  // the webhook also lands and races this same update.
  const featuredUntil = new Date(Date.now() + session.duration_days * 24 * 60 * 60 * 1000).toISOString();
  const { error: featureError } = await adminClient
    .from('listings')
    .update({ is_featured: true, featured_until: featuredUntil })
    .eq('id', session.listing_id);
  if (featureError) {
    console.error('verify-boost-payment: failed to flip is_featured', featureError);
  }

  await adminClient
    .from('boost_payment_sessions')
    .update({ status: 'paid', completed_at: new Date().toISOString() })
    .eq('dpay_session_id', session_id);

  return new Response(JSON.stringify({ success: true, featured_until: featuredUntil }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
