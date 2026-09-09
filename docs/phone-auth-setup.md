# Phone auth: Twilio + Supabase setup

Sign-up, sign-in and password reset are all phone-number based. There is no
email address anywhere in the app any more.

- **Sign up** — name, phone, password → a 6-digit code arrives → enter it →
  account created.
- **Sign in** — phone + password. No code, so no per-message cost on the path
  people take every day.
- **Forgot password** — phone → code → new password. Redeeming the code
  creates a real session, and a session is exactly the authority needed to
  change that account's password, so this needs no admin API and no emailed
  link.

**No delivery credentials live in the app.** Whichever route you pick, the
sending happens server-side — Twilio keys in the Supabase dashboard, or Meta
keys as Edge Function secrets. That's deliberate: anything shipped in the app
bundle is readable by anyone who downloads it.

There are two routes, and they're alternatives, not steps:

- **Twilio** (sections 1–3) — least setup, but nothing sends to Libya until
  the account is upgraded: geo permissions and the trial's verified-numbers
  rule are both behind the paywall.
- **WhatsApp via Meta's Cloud API** — no paid account needed to start, since
  Meta issues a free test number that messages up to five nominated
  recipients immediately. More setup, and Meta business verification is
  required before real users. Better delivery to Libya, because it rides on
  data rather than international SMS routing.

## 1. Twilio

You need three values from <https://console.twilio.com>:

| Value | Where |
| --- | --- |
| Account SID | Console dashboard, starts `AC…` |
| Auth Token | Console dashboard, next to the SID |
| Messaging Service SID | Messaging → Services → create one, starts `MG…` |

Create a **Messaging Service** rather than pasting a bare phone number —
Supabase accepts either, but a Messaging Service is what lets you add or swap
senders later without touching the app or the Supabase config. The number you
add to its sender pool must have SMS capability.

**Enable Libya in Geo Permissions first.** Messaging → Settings → **Geo
Permissions**, find Libya, tick it, save. Twilio ships with most destinations
switched *off*, so without this every send fails with error **21408
("Permission to send an SMS has not been enabled for the region")** — which
looks exactly like a broken integration and isn't one. This is the single
most common reason phone auth appears not to work on a fresh account.

## 2. Supabase

Dashboard → **Authentication** → **Sign In / Providers** → **Phone**:

1. Turn **Enable phone provider** on.
2. **SMS provider** → Twilio. Paste the three values above.
3. Leave **Confirm phone** ON. This is what makes the code mandatory — with it
   off, `signUp` returns a session immediately and the number is never
   actually proven. (The app handles that case rather than breaking, but it
   means anyone can register any number, including someone else's.)
4. **OTP expiry**: 600 seconds is a reasonable default. Shorter is safer;
   much shorter is hostile when SMS to Libya is slow.

Then run the two migrations, in this order:

```
supabase/migration_cleanup_users_for_phone_auth.sql   # deletes pre-cutover accounts — read its header first
supabase/migration_phone_auth_no_email.sql            # drops profiles.email and the reset-email plumbing
```

The first one is **destructive and irreversible**. Its header explains what it
removes and tells you to run the SELECT alone first. Do that.

## 3. Choosing the channel

`src/utils/otp.js` holds a single constant:

```js
export const OTP_CHANNEL = 'sms';
```

`channel` tells Supabase which of *its own* SMS providers to use. If you take
the Send SMS Hook route below, Supabase never reaches a provider at all — the
hook decides delivery — so this constant stays on `'sms'` even when codes are
going out over WhatsApp. That looks contradictory and isn't: it only has to
remain a value the API accepts. Change it to `'whatsapp'` only if you're
using Twilio *and* have a WhatsApp sender attached there.

## What the free trial can and can't do

Worth knowing before you test, because both limits look like bugs:

- **A trial account can only send to numbers you've verified** in the Twilio
  console (Phone Numbers → Verified Caller IDs). Sending to any other number
  fails with error 21608. So you can test with your own phone and any number
  you add there, but nobody else can sign up until the account is upgraded.
- **Trial messages are prefixed** with "Sent from your Twilio trial account".
  Harmless, but it's in the SMS your testers will see.
- **The trial credit is small.** Each OTP is a real paid message once you
  upgrade; sign-in deliberately doesn't send one, which is most of why.

## Reading a failure

Twilio → Monitor → **Logs** → Messaging shows every attempt with a status and
error code. The four worth recognising:

| Code | Means |
| --- | --- |
| 21408 | Libya isn't enabled in Geo Permissions |
| 21608 | Trial account, and the recipient isn't a Verified Caller ID |
| 30003 / 30005 | Handset unreachable or number doesn't exist — carrier-side |
| 30007 | Carrier filtered the message as spam |

A message logged as *delivered* that never arrived is a carrier problem, not a
configuration one. An *undelivered* with a code above usually isn't.

## WhatsApp via Meta's Cloud API (no Twilio)

This is the route that doesn't need a paid Twilio account. Supabase's **Send
SMS Hook** lets you replace the SMS provider with your own function, so
`supabase/functions/send-whatsapp-otp` receives the code Supabase generated
and delivers it through Meta directly. Supabase still generates, stores,
expires and verifies the code — only delivery changes.

The reason to prefer it here isn't just cost: WhatsApp reaches Libyan phones
over data rather than the international A2P SMS routes that make delivery
unreliable in the first place.

### 1. Meta app and test number

1. **business.facebook.com** — create a Meta Business account.
2. **developers.facebook.com** → My Apps → **Create App** → type **Business**.
3. **Add product → WhatsApp → Set up.** This creates a WhatsApp Business
   Account and a **free test phone number**.
4. On the **API Setup** page, note the **Phone number ID** (a number, not the
   phone number itself) and add your own number under "To" — you'll get a
   WhatsApp code to confirm it. Up to five recipients, no business
   verification needed, which is what makes testing possible today.
5. Use the **Send message** button there. If it arrives, the path works.

### 2. A permanent token

The token on the API Setup page expires in 24 hours. For anything beyond a
first test:

**Business Settings → Users → System Users** → add one → **Generate token** →
select your app → scopes `whatsapp_business_messaging` and
`whatsapp_business_management`. That token doesn't expire.

### 3. The template

WhatsApp forbids free-form business-initiated messages, so the code has to go
out as an approved template.

**WhatsApp Manager → Message Templates → Create template** → category
**Authentication** → the one-time-passcode layout with the copy-code button.
Authentication templates are usually approved in minutes rather than the days
a marketing template takes. Note the **name** and **language code**.

Create it in Arabic (`ar`) — it's what most users will see. Meta treats each
language as its own approval, so an English version is a second submission.

### 4. Deploy the function

```bash
supabase functions deploy send-whatsapp-otp --no-verify-jwt
```

`--no-verify-jwt` is required: Supabase Auth calls this hook *before* anyone
has a session, so there's no JWT to verify. The function isn't left open —
it verifies the hook's own signature instead, which is what stops it being a
free WhatsApp relay for anyone who finds the URL.

Then set its secrets:

```bash
supabase secrets set   WHATSAPP_TOKEN=...   WHATSAPP_PHONE_NUMBER_ID=...   WHATSAPP_TEMPLATE_NAME=...   WHATSAPP_TEMPLATE_LANG=ar
```

### 5. Point Supabase at it

Dashboard → **Authentication → Hooks** → **Send SMS hook** → enable, choose
the `send-whatsapp-otp` function. Supabase shows a signing secret that looks
like `v1,whsec_…` — copy it and set it as one more function secret:

```bash
supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_...'
```

Every request the function accepts is checked against that secret.

### 6. Turn confirmation back on

Authentication → Sign In / Providers → Phone → **Confirm phone ON**. If you
switched it off to keep working while delivery was unavailable, this is the
step that closes that hole — while it's off, nothing proves a number belongs
to the person signing up.

### Going live later

The test number only messages five nominated recipients. Real users need a
production sender: a phone number **not already registered on WhatsApp**,
attached to your WhatsApp Business Account, plus Meta **business
verification**. Start that early — it's the long pole, and it's the one part
of this nobody can speed up.

Two things worth checking before you build a launch plan on this route:
whether Meta accepts business verification with Libyan business details, and
Meta's current per-message price for authentication messages to Libya.

## SMS delivery to Libya

Set expectations here — this is the part nobody controls. Delivery to Libyan
carriers (Libyana, Al-Madar) via international A2P routes is inconsistent:
messages can be slow, and some routes drop them entirely. Things that help:

- The 60-second resend cooldown in `AuthModal` exists so a slow first message
  isn't immediately followed by three more.
- If delivery turns out to be bad in practice, WhatsApp is the better channel
  for Libya specifically — it's data, not SMS routing — which is the real
  argument for finishing the Meta process.
- Twilio's Messaging → Logs shows per-message status and error codes. A
  message that says "delivered" but never arrived is a carrier problem; one
  that says "undelivered" with an error code is usually fixable.

## Testing checklist

1. Sign up with a verified number → code arrives → account created, name saved.
2. Force-close and sign in with phone + password → no code sent.
3. Forgot password → code → new password → signed in.
4. Forgot password with a number that has no account → "no account for this
   number", and crucially *no account is created* (`shouldCreateUser: false`).
5. Wrong code → localized error, field clears, resend available after 60s.
6. Both languages: Arabic and English, checking the code field stays
   left-to-right under RTL.
