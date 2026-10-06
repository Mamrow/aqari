// Delivery channel for the one-time codes used at sign-up and password
// reset. Every call site reads this constant — nothing hardcodes a channel
// string — so switching the whole app over is a one-line edit here.
//
// 'sms' is the value Supabase's phone API expects, and codes do arrive by
// SMS — but not through any of Supabase's own SMS providers. A Send SMS Hook
// (Authentication -> Hooks) hands every code to the send-sms-otp Edge
// Function, which delivers it through Resala, a Libyan SMS gateway. So no
// messaging SDK or credentials live in the app. verifyOtp's `type: 'sms'`
// matches.
//
// WhatsApp was tried first and dropped: Meta keeps login-code templates
// locked for a business that isn't verified yet. See
// supabase/functions/send-sms-otp/index.ts and docs/phone-auth-setup.md.
export const OTP_CHANNEL = 'sms';
