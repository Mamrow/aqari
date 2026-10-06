// Aqari — delivers auth one-time codes by SMS, through Resala (resala.ly), a
// Libyan SMS gateway.
//
// Like send-whatsapp-otp, this is a Supabase **Send SMS Hook**: Supabase
// generates, stores, expires and verifies the code, and calls this function
// only to deliver it. No database access, no state. Pointing the hook
// (Authentication → Hooks → Send SMS) at this function instead of
// send-whatsapp-otp is the whole switch; the app doesn't change, because its
// OTP_CHANNEL is already 'sms' and its code screen already says "by SMS".
//
// Why send-template and not Resala's /pins: /pins generates its *own* code
// and leaves verifying it to the caller. Supabase only accepts the code it
// generated, so the code has to be ours, dropped into a Resala SMS template
// as its $1 variable.
//
// Secrets (supabase secrets set ...):
//   SEND_SMS_HOOK_SECRET   the "v1,whsec_..." value Supabase shows for the hook
//                          (the same secret send-whatsapp-otp checks)
//   RESALA_TOKEN           the Authorization token from the Resala dashboard
//   RESALA_TEMPLATE_ID     the id of an SMS template whose text contains $1,
//                          e.g. "رمز التحقق الخاص بك في عقاري: $1"
//   RESALA_API_BASE        optional, defaults below

const DEFAULT_API_BASE = 'https://dev.resala.ly/api/v1';

// Standard Webhooks signature check, identical to send-whatsapp-otp's: HMAC-
// SHA256 over "<id>.<timestamp>.<body>", sent as one or more "v1,<sig>".
async function isSignatureValid(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  // Older than five minutes is a replay, not a fresh request.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const rawSecret = secret.replace(/^v1,\s*/, '').replace(/^whsec_/, '');
  const keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return signatureHeader
    .split(' ')
    .map((part) => part.split(',')[1])
    .some((candidate) => timingSafeEqual(candidate ?? '', expected));
}

// Constant-time comparison: a valid call here sends a real, paid SMS.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function jsonError(message: string, httpCode: number) {
  // The shape Supabase Auth expects from a hook; `message` reaches the app,
  // so it never carries anything internal.
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: httpCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const token = Deno.env.get('RESALA_TOKEN');
  const templateId = Deno.env.get('RESALA_TEMPLATE_ID');
  const apiBase = (Deno.env.get('RESALA_API_BASE') ?? DEFAULT_API_BASE).replace(/\/+$/, '');

  if (!hookSecret || !token || !templateId) {
    console.error('send-sms-otp: missing required secrets');
    return jsonError('Verification is not configured on the server.', 500);
  }

  const body = await req.text();
  if (!(await isSignatureValid(hookSecret, req.headers, body))) {
    // Unsigned means it didn't come from Supabase Auth; without this check
    // the function would be a free SMS relay for anyone who found the URL.
    return jsonError('Unauthorized', 401);
  }

  const payload = JSON.parse(body) as {
    user?: { phone?: string };
    sms?: { otp?: string };
  };
  const otp = payload.sms?.otp;
  // Resala wants international digits with no '+', e.g. 218910001234.
  const phone = payload.user?.phone?.replace(/[^\d]/g, '');
  if (!otp || !phone) {
    return jsonError('Malformed verification request.', 400);
  }

  const response = await fetch(
    `${apiBase}/messages/send-template?sms_template_id=${encodeURIComponent(templateId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify([{ phone, $1: otp }]),
    }
  );

  if (!response.ok) {
    // Resala's error `type` (InsufficientCredit, AccountExpired, ...) is what
    // explains a failure, so log the body; the app only gets a generic message.
    console.error('send-sms-otp: Resala rejected the send', response.status, await response.text());
    return jsonError('Could not send the verification code. Please try again.', 502);
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
