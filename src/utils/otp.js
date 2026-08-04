// Delivery channel for sign-up/sign-in verification codes. Starting on SMS —
// works immediately via Twilio Verify, no dedicated number or Meta business
// approval needed. WhatsApp needs a dedicated WhatsApp Business Sender
// (Meta verification, ~1-2 weeks) and its Libya coverage still isn't
// confirmed — once both are sorted, flip this to 'whatsapp' and every call
// site (they all reference this constant, never a hardcoded string)
// switches over in one place.
export const OTP_CHANNEL = 'sms';
