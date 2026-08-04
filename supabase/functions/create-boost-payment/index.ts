// Aqari — opens a Dpay payment session for a seller buying Featured on one
// of their own listings. Price is looked up server-side (never trusted from
// the client) and the session is recorded in boost_payment_sessions so
// verify-boost-payment/dpay-webhook can find their way back to the right
// listing once Dpay confirms payment.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// LYD prices per Featured duration.
const FEATURED_PRICES: Record<number, number> = { 3: 5, 7: 10, 14: 15 };
const ALLOWED_METHODS = ['edfali', 'sadad', 'moamalat', 'masrefypay'];

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401 });
  }

  // Identifies the caller from their own JWT — same pattern as
  // delete-account/index.ts — rather than trusting any id the client sends.
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

  const body = await req.json();
  const { listing_id, duration_days, pay_method, customer_mobile, birth_year, category, card_number } =
    body;

  const amount = FEATURED_PRICES[duration_days];
  if (!listing_id || !amount || !ALLOWED_METHODS.includes(pay_method)) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }
  if ((pay_method === 'edfali' || pay_method === 'sadad') && !customer_mobile) {
    return new Response(JSON.stringify({ error: 'customer_mobile is required' }), { status: 400 });
  }
  if (pay_method === 'sadad' && !birth_year) {
    return new Response(JSON.stringify({ error: 'birth_year is required for Sadad' }), { status: 400 });
  }
  if (pay_method === 'masrefypay' && !card_number) {
    return new Response(JSON.stringify({ error: 'card_number is required' }), { status: 400 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Confirm the caller actually owns this listing before opening a paid
  // session for it — never trust listing_id alone.
  const { data: listing, error: listingError } = await adminClient
    .from('listings')
    .select('id, owner_id')
    .eq('id', listing_id)
    .single();
  if (listingError || !listing || listing.owner_id !== userId) {
    return new Response(JSON.stringify({ error: 'Listing not found or not owned by you' }), { status: 403 });
  }

  const dpayBody: Record<string, unknown> = {
    pay_method,
    amount,
    data: { listing_id, user_id: userId, duration_days },
  };
  if (pay_method === 'edfali' || pay_method === 'sadad') dpayBody.customer_mobile = customer_mobile;
  if (pay_method === 'sadad') {
    dpayBody.birth_year = birth_year;
    if (category != null) dpayBody.category = category;
  }
  if (pay_method === 'masrefypay') dpayBody.card_number = card_number;

  const dpayRes = await fetch(`${Deno.env.get('DPAY_API_BASE_URL')}/payment/sessions/open`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('DPAY_API_TOKEN')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(dpayBody),
  });
  const dpayData = await dpayRes.json();
  if (!dpayRes.ok) {
    return new Response(
      JSON.stringify({ error: dpayData.message ?? 'Dpay session creation failed', details: dpayData }),
      { status: 400 }
    );
  }

  const { error: insertError } = await adminClient.from('boost_payment_sessions').insert({
    dpay_session_id: dpayData.session_id,
    listing_id,
    owner_id: userId,
    pay_method,
    duration_days,
    amount,
    status: 'pending',
  });
  if (insertError) {
    console.error('boost_payment_sessions insert error', insertError);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      session_id: dpayData.session_id,
      pay_method,
      amount: dpayData.amount,
      total: dpayData.total,
      payment_link: dpayData.payment_link ?? null,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
