# Phone auth: Resala SMS + Supabase setup

Accounts are phone + password. A one-time code proves the number at sign-up
and again for "forgot password"; everyday sign-in uses the password only, so
the per-message cost stays off the common path.

Supabase generates, stores, expires and verifies every code. Delivery is the
only part outside Supabase: a **Send SMS Hook** hands each code to the
`send-sms-otp` Edge Function, which sends it by SMS through **Resala**
(resala.ly, run by Sadeem Technology), a Libyan gateway. No messaging
credentials ever live in the app.

## Why Resala

- **WhatsApp (Meta)** was built first and dropped. Meta keeps the
  Authentication template category locked on a business that isn't verified
  (code 10 / subcode 2388185 on template creation), and login codes may not
  be sent through any other category.
- **Twilio** works, but charges $0.44 per SMS to Libya.
- **Resala** is local, pay-as-you-go in LYD, and has a free test mode.

## 1. Resala account and template

1. Sign up at resala.ly and top up the wallet.
2. Copy the **Authorization token** from the dashboard. It goes into Supabase
   secrets only, never into the app or a chat.
3. Under **قوالب الرسائل** (message templates), create a template whose text
   contains `$1` where the code goes, for example:
   `رمز التحقق الخاص بك في عقاري: $1`
4. Copy its id with **نسخ معرف القالب**.

The function uses `send-template`, not Resala's `/pins`. `/pins` generates its
own code and leaves verifying it to the caller, but Supabase only accepts the
code Supabase generated.

## 2. Deploy the function

```bash
supabase functions deploy send-sms-otp --no-verify-jwt
```

`--no-verify-jwt` because the caller is Supabase Auth, not a signed-in user. The
function checks the hook's own signature instead.

## 3. Secrets

```bash
supabase secrets set RESALA_TOKEN=... RESALA_TEMPLATE_ID=...
# optional, if Resala gives a different live address than the default
supabase secrets set RESALA_API_BASE=https://.../api/v1
```

The default `RESALA_API_BASE` is `https://dev.resala.ly/api/v1`, the address in
Resala's documentation.

## 4. The hook

Supabase dashboard → **Authentication → Hooks → Send SMS hook** → type
**HTTPS** → the `send-sms-otp` function's URL. Supabase shows a signing secret
like `v1,whsec_…`:

```bash
supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_...'
```

**Authentication → Providers → Phone** must be enabled, with no SMS provider
needed: the hook replaces it.

## 5. Test

Sign up, or use "forgot password", with a real number. The SMS should arrive
within seconds and the code should work in the app. If it doesn't, the
function's logs (Supabase → Edge Functions → send-sms-otp → Logs) show
Resala's error `type`:

| type | meaning |
|---|---|
| `Unauthorized` / `TokenExpired` | `RESALA_TOKEN` missing or wrong |
| `InsufficientCredit` | top up the Resala wallet |
| `AccountExpired` | renew the Resala subscription |
| `InputValidation` (422) | request shape: the body is `{ "records": [...] }`; Resala's dashboard page shows a bare array instead, so try that first |

Sends are never retried automatically: a retry is a second paid SMS.
