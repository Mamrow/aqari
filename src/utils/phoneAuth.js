// Supabase Auth's phone provider requires SMS/OTP verification, which this
// app deliberately avoids (cost/complexity, declined earlier in the
// project). To still get real password-protected accounts, each phone
// number is registered as a hidden internal email address — Supabase treats
// it as an ordinary email/password account; the app only ever shows/collects
// the phone number, never this synthetic address.
//
// The TLD here can't be .test/.example/.invalid/.localhost/.internal —
// ICANN formally reserved .internal as a special-use domain in 2024, and
// Supabase Auth rejects any address on that reserved list outright
// ("email_address_invalid") before it ever tries to send anything, so an
// ordinary-looking non-reserved TLD is required even though this address is
// never actually meant to receive mail.
export function phoneToInternalEmail(phone) {
  const digits = phone.replace(/[^\d]/g, '');
  return `${digits}@phone.aqari.dev`;
}
