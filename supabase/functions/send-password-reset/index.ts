// Supabase's own resetPasswordForEmail can only ever deliver to an
// account's own REGISTERED email — for this app that's always the synthetic
// phone.aqari.dev address (see src/utils/phoneAuth.js's phoneToInternalEmail),
// which nobody can actually receive mail at. There is no Supabase setting
// that redirects delivery to a different address than the account's own, so
// every previous attempt to fix this via SMTP config was chasing the wrong
// thing — resetPasswordForEmail(realEmail) always "succeeded" (Supabase
// hides whether an email matched, to prevent account enumeration) without
// ever having a matching user to actually send to.
//
// admin.generateLink sidesteps that: it mints a valid one-time recovery
// token for the account without sending anything itself. This function
// emails THAT token to the account's real profiles.email via Resend
// directly, entirely bypassing Supabase's own mailer.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const { phone, redirectTo } = await req.json();
  if (!phone || !redirectTo) {
    return new Response(JSON.stringify({ error: 'Missing phone or redirectTo' }), { status: 400 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Same rate-limited lookup the old client-side flow used (still enforces
  // the 5-per-15-minutes cap) — now only ever called server-side.
  const { data: realEmail, error: lookupError } = await adminClient.rpc('get_reset_email_for_phone', {
    p_phone: phone,
  });
  if (lookupError) {
    return new Response(JSON.stringify({ error: lookupError.message }), { status: 200 });
  }
  if (!realEmail) {
    return new Response(JSON.stringify({ error: 'NO_ACCOUNT' }), { status: 200 });
  }

  const digits = phone.replace(/[^\d]/g, '');
  const syntheticEmail = `${digits}@phone.aqari.dev`;

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: syntheticEmail,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    return new Response(
      JSON.stringify({ error: linkError?.message ?? 'Could not generate reset link' }),
      { status: 200 }
    );
  }

  const resetUrl = `${redirectTo}?token_hash=${linkData.properties.hashed_token}&type=recovery`;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('RESET_EMAIL_SENDER') ?? 'Aqari <onboarding@resend.dev>',
      to: realEmail,
      subject: 'Reset your Aqari password',
      html: `<p>Tap the link below on your phone to reset your Aqari password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    }),
  });

  if (!resendRes.ok) {
    const body = await resendRes.text();
    return new Response(JSON.stringify({ error: `Email send failed: ${body}` }), { status: 200 });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
