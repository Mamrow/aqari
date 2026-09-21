// Delivery channel for the one-time codes used at sign-up and password
// reset. Every call site reads this constant — nothing hardcodes a channel
// string — so switching the whole app over is a one-line edit here.
//
// 'sms' here does NOT mean the code arrives by SMS. It names one of
// Supabase's own providers, and the project doesn't use any of them: a Send
// SMS Hook (Authentication -> Hooks) intercepts every code and hands it to
// the send-whatsapp-otp Edge Function, which delivers it over WhatsApp via
// Meta's Cloud API. So this constant only has to stay a value the API
// accepts, and verifyOtp's `type: 'sms'` is correct for the same reason —
// Supabase has no separate WhatsApp verify type.
//
// Why WhatsApp and not Twilio: Twilio needs a paid account before it will
// send to Libya at all, and international A2P SMS routes there are
// unreliable in the first place. WhatsApp rides on data instead. See
// supabase/functions/send-whatsapp-otp/index.ts and
// docs/phone-auth-setup.md.
export const OTP_CHANNEL = 'sms';
