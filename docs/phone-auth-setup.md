# Phone auth: WhatsApp (Meta) + Supabase setup

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

## Supabase settings

Dashboard → **Authentication** → **Sign In / Providers** → **Phone**:

1. Turn **Enable phone provider** on.
2. **SMS provider** → pick anything and leave it unconfigured. With the hook
   below enabled Supabase never reaches a provider, but the form still wants
   the field populated.
3. Leave **Confirm phone** ON. This is what makes the code mandatory — with it
   off, `signUp` returns a session immediately and the number is never
   actually proven. (The app handles that case rather than breaking, but it
   means anyone can register any number, including someone else's.)
4. **OTP expiry**: 600 seconds is a reasonable default. Shorter is safer;
   much shorter is hostile when SMS to Libya is slow.

Then **Authentication → Hooks → Send SMS hook**: enable it, point it at the
deployed `send-whatsapp-otp` function, and copy the `v1,whsec_…` secret it
shows you into the function's `SEND_SMS_HOOK_SECRET`. That hook is what
diverts delivery away from SMS entirely.

Then run the two migrations, in this order:

```
supabase/migration_cleanup_users_for_phone_auth.sql   # deletes pre-cutover accounts — read its header first
supabase/migration_phone_auth_no_email.sql            # drops profiles.email and the reset-email plumbing
```

The first one is **destructive and irreversible**. Its header explains what it
removes and tells you to run the SELECT alone first. Do that.

## Why OTP_CHANNEL still says 'sms'

`src/utils/otp.js` holds a single constant:

```js
export const OTP_CHANNEL = 'sms';
```

`channel` tells Supabase which of *its own* SMS providers to use. If you take
the Send SMS Hook route below, Supabase never reaches a provider at all — the
hook decides delivery — so this constant stays on `'sms'` even when codes are
going out over WhatsApp. That looks contradictory and isn't: it only has to
remain a value the API accepts. Change it to `'whatsapp'` only if you're
using one of Supabase's own SMS providers with a WhatsApp sender attached,
which this project doesn't.

## Setting up WhatsApp delivery

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

## Delivery notes

WhatsApp reaches Libyan phones over data, which is the main reason this
project doesn't send SMS at all: international A2P SMS routes into Libyana and
Al-Madar are slow and sometimes drop messages entirely, and nothing on your
side can fix that.

The 60-second resend cooldown in `AuthModal` exists so a slow first message
isn't immediately followed by three more. Delivery failures show up in Meta's
WhatsApp Manager rather than anywhere in Supabase — a code Supabase generated
successfully can still fail to arrive, and only Meta knows why.

## Testing checklist

1. Sign up with a verified number → code arrives → account created, name saved.
2. Force-close and sign in with phone + password → no code sent.
3. Forgot password → code → new password → signed in.
4. Forgot password with a number that has no account → "no account for this
   number", and crucially *no account is created* (`shouldCreateUser: false`).
5. Wrong code → localized error, field clears, resend available after 60s.
6. Both languages: Arabic and English, checking the code field stays
   left-to-right under RTL.

On a test number, only the recipients nominated in Meta's API Setup page can
receive anything — a code that never arrives for anyone else is that limit,
not a bug.
