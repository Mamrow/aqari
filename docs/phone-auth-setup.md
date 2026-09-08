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

**The app contains no Twilio code and no Twilio credentials.** Supabase's own
phone provider does the sending; your Twilio keys live in the Supabase
dashboard, server-side. That's deliberate — anything shipped in the app bundle
is readable by anyone who downloads it.

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

Every call site reads it — nothing hardcodes a channel string — so `'whatsapp'`
switches the whole app over in one edit. Leave it on `'sms'` for now, because
WhatsApp needs more than a config change (below).

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

## WhatsApp

`OTP_CHANNEL = 'whatsapp'` needs a real WhatsApp sender, which is a Meta
process, not a Twilio setting:

1. A Twilio Messaging Service with a **WhatsApp sender** attached.
2. A **WhatsApp Business Account**, verified by Meta. This takes days to
   weeks and needs business details.
3. An **approved message template** for the code. WhatsApp does not allow
   free-form business-initiated messages — Twilio provides an authentication
   template for exactly this, but it still has to be approved on your account.

The **WhatsApp Sandbox** on a trial is not a substitute: every recipient has
to first send a join code to Twilio's sandbox number from their own WhatsApp,
which is not something you can ask real users to do. Fine for testing the
plumbing, unusable for launch.

So: launch on SMS, flip the constant once WhatsApp clears Meta review.

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
