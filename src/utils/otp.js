// Delivery channel for the one-time codes used at sign-up and password
// reset. Every call site reads this constant — nothing hardcodes a channel
// string — so switching the whole app over is a one-line edit here.
//
// Starting on SMS because that's all a Twilio account can do out of the box.
// WhatsApp isn't a config change: it needs a WhatsApp sender on the Messaging
// Service, a Meta-verified WhatsApp Business Account, and an approved
// authentication template — days to weeks. The WhatsApp Sandbox isn't a
// substitute, since every recipient has to message a join code to Twilio's
// sandbox number first.
//
// Worth revisiting once that clears: SMS delivery to Libyan carriers over
// international A2P routes is genuinely unreliable, and WhatsApp rides on
// data instead. See docs/phone-auth-setup.md.
export const OTP_CHANNEL = 'sms';
