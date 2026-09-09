// Aqari — delivers auth one-time codes over WhatsApp, via Meta's Cloud API.
//
// This is a Supabase **Send SMS Hook**: with it configured (Authentication →
// Hooks → "Send SMS hook"), Supabase stops calling its SMS provider and calls
// this function instead, handing us the phone number and the code it just
// generated. Supabase still owns generating, storing, expiring and verifying
// the code — this function's only job is delivery. That's why there's no
// database access here and no state of any kind.
//
// Why Meta directly rather than Twilio: Twilio needs a paid account before it
// will send anything to Libya at all (geo permissions and the trial's
// verified-numbers rule are both behind the upgrade), while Meta's Cloud API
// issues a free test number that can message up to five nominated recipients
// immediately. It also drops the middleman markup, and WhatsApp reaches
// Libyan phones over data instead of the international A2P SMS routes that
// make delivery there unreliable in the first place.
//
// Note on the app side: src/utils/otp.js still says OTP_CHANNEL = 'sms', and
// that's correct, not a leftover. `channel` tells Supabase which of *its own*
// providers to use; once this hook is enabled Supabase never reaches a
// provider at all, so the constant only has to stay on a value the API
// accepts. Delivery is decided here.
//
// Secrets (supabase secrets set ...):
//   SEND_SMS_HOOK_SECRET      the "v1,whsec_..." value Supabase shows when you
//                             create the hook — signs every request
//   WHATSAPP_TOKEN            permanent System User token (never the 24-hour
//                             temporary one from the API Setup page)
//   WHATSAPP_PHONE_NUMBER_ID  the sender's numeric id, not the phone number
//   WHATSAPP_TEMPLATE_NAME    an approved Authentication-category template
//   WHATSAPP_TEMPLATE_LANG    its language code, e.g. ar / en_US  (default ar)
//   WHATSAPP_API_VERSION      optional, defaults below

const GRAPH_HOST = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v21.0';
const DEFAULT_TEMPLATE_LANG = 'ar';

// Supabase signs hook requests with the Standard Webhooks scheme: HMAC-SHA256
// over "<id>.<timestamp>.<body>", base64, sent as "v1,<sig>" — possibly
// several space-separated signatures during a secret rotation, hence the
// loop below rather than a single comparison.
async function isSignatureValid(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject anything more than five minutes old, so a captured request can't
  // be replayed later to burn through someone's rate limit.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  // The secret is given as "v1,whsec_<base64>"; the signing key is the raw
  // bytes that base64 decodes to, not the string itself.
  const rawSecret = secret.replace(/^v1,\s*/, '').replace(/^whsec_/, '');
  const keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return signatureHeader
    .split(' ')
    .map((part) => part.split(',')[1])
    .some((candidate) => candidate === expected);
}

function jsonError(message: string, httpCode: number) {
  // The shape Supabase Auth expects back from a hook: it surfaces `message`
  // to the client, so keep these free of anything internal.
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: httpCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const templateName = Deno.env.get('WHATSAPP_TEMPLATE_NAME');
  const templateLang = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? DEFAULT_TEMPLATE_LANG;
  const apiVersion = Deno.env.get('WHATSAPP_API_VERSION') ?? DEFAULT_API_VERSION;

  if (!hookSecret || !token || !phoneNumberId || !templateName) {
    console.error('send-whatsapp-otp: missing required secrets');
    return jsonError('Verification is not configured on the server.', 500);
  }

  const body = await req.text();
  if (!(await isSignatureValid(hookSecret, req.headers, body))) {
    // Unsigned means it didn't come from Supabase Auth. Since a valid call
    // sends a real (chargeable) message, this check is what stops the
    // function being a free WhatsApp relay for anyone who finds the URL.
    return jsonError('Unauthorized', 401);
  }

  const payload = JSON.parse(body) as {
    user?: { phone?: string };
    sms?: { otp?: string };
  };
  const otp = payload.sms?.otp;
  // Meta wants E.164 digits with no '+' — Supabase may send it either way.
  const to = payload.user?.phone?.replace(/[^\d]/g, '');

  if (!otp || !to) {
    return jsonError('Malformed verification request.', 400);
  }

  // Authentication-category templates take the code twice: once for the body
  // text, once for the copy-code button. Meta rejects the send outright if
  // the button component is missing, which reads as a confusing template
  // mismatch error rather than anything about buttons.
  const message = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: otp }] },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: otp }],
        },
      ],
    },
  };

  const response = await fetch(`${GRAPH_HOST}/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    // Log Meta's own error — it's specific and worth having in the function
    // logs (unregistered recipient, expired token, template not approved in
    // that language) — but don't pass it to the client, where it would leak
    // sender ids and account state.
    console.error('send-whatsapp-otp: Meta rejected the send', response.status, await response.text());
    return jsonError('Could not send the verification code. Please try again.', 502);
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
